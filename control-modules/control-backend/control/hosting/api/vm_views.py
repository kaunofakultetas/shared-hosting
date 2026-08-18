############################################################
#  [*] VM views — the list and the control actions
#
#  GET /api/vm assembles the whole card payload in Python:
#  the REGISTRY drives the list (every non-deleted VM shows)
#  and the containers cache decorates it with live state — a
#  row whose container the monitor has not seen yet renders
#  as "creating" (fresh row) or "unknown" (old row). Ids are
#  integers; stacks/domains/portforwards are null when empty.
#  The frontend polls this every 3 seconds.
#
#  POST /api/vm/control proxies to the docker sidecar;
#  create and delete answer 202 and finish in one-shot
#  background threads (see vm_control).
#
#  Used by:
#    - VirtualServersTable.jsx — list + card actions
#    - VirtualServer.jsx — the detail page (same endpoint)
############################################################

import threading
from datetime import timedelta

from django.db import close_old_connections, transaction
from django.http import JsonResponse
from django.utils import timezone

import requests

from control.common.auth import (
    check_user_is_allowed_to_access_vm,
    format_datetime,
    get_json,
    log_activity,
    login_required,
)
from control.hosting import docker_controller
from control.hosting.api.portforward_views import PORTFORWARD_PUBLIC_HOST
from control.hosting.models import DIND_PREFIX, DockerContainer, DomainName, PortForward, VirtualServer, VmUsage
from control.users.models import SystemUser


# Names may use every Lithuanian letter, digits, underscore,
# parentheses and space — exactly what the error message says
LITHUANIAN_CHARS = 'aąbcčdeęėfghiįyjklmnopqrsštuųūvwxyzž0123456789_() '








############################################################
# parse_stack_name
############################################################
#
# Extracts the compose project ("stack") name out of the
# cached comma-joined Labels string. Containers started
# outside compose have no such label — those group under ''
# on purpose.
#
# Used by:
#   - vm_list (below) — grouping each VM's containers
############################################################

def parse_stack_name(labels):
    marker = 'com.docker.compose.project='
    position = labels.find(marker)
    if position == -1:
        return ''
    value = labels[position + len(marker):]
    commaPosition = value.find(',')
    if commaPosition != -1:
        value = value[:commaPosition]
    return value.strip()








############################################################
# vm_list
############################################################
#
# GET /api/vm — every VM the caller may see (a JSON array,
# ids as integers), driven by the containers cache.
# GET /api/vm/<id> — that one VM as a plain object, or 404
# while it has no container in the cache (a just-created VM
# becomes visible on the monitor's next pass).
# ?showOtherUsers=true is admin-only; with a specific id it
# is ignored — ownership is what gates single-VM access.
#
# Used by:
#   - VirtualServersTable.jsx (3 s poll), VirtualServer.jsx
############################################################

@login_required
def vm_list(request, virtualServerID=None):

    showOtherUsersVMs = request.GET.get('showOtherUsers', 'false').lower() == 'true'
    if request.current_user.admin == 0 and showOtherUsersVMs:
        return JsonResponse({'message': 'Unauthorized'}, status=401)

    # Check if user is allowed to access specific virtual server
    if virtualServerID is not None:
        if check_user_is_allowed_to_access_vm(request.current_user, virtualServerID) == False:
            return JsonResponse({'message': 'Unauthorized'}, status=401)


    # The dind containers on the host — one per live VM
    dindRows = {}
    for thisRow in DockerContainer.objects.filter(parent_server_id=0, names__startswith=DIND_PREFIX).order_by('id'):
        vmIdText = thisRow.names.replace(DIND_PREFIX, '')
        if vmIdText.isdigit() and vmIdText not in dindRows:
            dindRows[vmIdText] = thisRow


    # ALL non-deleted VM rows — the REGISTRY drives the list;
    # the cache only decorates it with live state. A row whose
    # container the monitor has not seen yet still shows, as
    # "creating" (fresh row) or "unknown" (old row — manually
    # removed container, or the sidecar is unreachable).
    virtualServers = {
        thisVm.id: thisVm
        for thisVm in VirtualServer.objects.filter(deleted=False).exclude(id=0)
    }
    ownerEmails = dict(
        SystemUser.objects.filter(id__in=[thisVm.owner_id for thisVm in virtualServers.values() if thisVm.owner_id is not None])
        .values_list('id', 'email')
    )


    # Every VM's containers grouped by stack, in one query
    stacksByVm = {}
    for thisRow in DockerContainer.objects.exclude(parent_server_id=0).order_by('id'):
        stackName = parse_stack_name(thisRow.labels)
        stacksByVm.setdefault(thisRow.parent_server_id, {}).setdefault(stackName, []).append({
            'image': thisRow.image,
            'names': thisRow.names,
            'runningfor': thisRow.running_for,
            'state': thisRow.state,
            'status': thisRow.status,
        })


    # Every VM's domains, in one query
    domainsByVm = {}
    for thisDomain in DomainName.objects.order_by('id'):
        domainsByVm.setdefault(thisDomain.virtual_server_id, []).append({
            'id': thisDomain.id,
            'domainname': thisDomain.domain_name,
            'iscloudflare': int(thisDomain.is_cloudflare),
            'ssl': int(thisDomain.ssl),
        })


    # Every VM's port forwards, in one query — publichost rides
    # along so the card can render the exact connect string
    portForwardsByVm = {}
    for thisForward in PortForward.objects.order_by('id'):
        portForwardsByVm.setdefault(thisForward.virtual_server_id, []).append({
            'id': thisForward.id,
            'publichost': PORTFORWARD_PUBLIC_HOST,
            'publicport': thisForward.public_port,
            'internalport': thisForward.internal_port,
            'description': thisForward.description,
        })


    # Every VM's live usage (the monitor's telemetry), in one
    # query — null while nothing has been measured
    usageByVm = {
        thisUsage.virtual_server_id: {
            'cpu_percent': round(thisUsage.cpu_percent, 1) if thisUsage.cpu_percent is not None else None,
            'memory_mb': thisUsage.memory_mb,
            'disk_mb': thisUsage.disk_mb,
            'cpu_measured_at': format_datetime(thisUsage.cpu_measured_at),
            'disk_measured_at': format_datetime(thisUsage.disk_measured_at),
        }
        for thisUsage in VmUsage.objects.all()
    }


    # Assemble, in numeric id order
    responseData = []
    for vmId in sorted(virtualServers):
        thisVm = virtualServers[vmId]

        # A specific id was asked for — only that one
        if virtualServerID is not None and vmId != virtualServerID:
            continue

        # Non-admin view of the list — own VMs only
        if virtualServerID is None and showOtherUsersVMs == False and thisVm.owner_id != request.current_user.id:
            continue

        # Live state from the cache; without a cache row the
        # registry row speaks for itself — a fresh one is a
        # create in flight, an old one is honestly unknown
        dindRow = dindRows.get(str(vmId))
        if dindRow is not None:
            state, status = dindRow.state, dindRow.status
        elif timezone.now() - thisVm.created_at < timedelta(minutes=5):
            state, status = 'creating', None
        else:
            state, status = 'unknown', None

        stacks = [
            {'stackname': stackName, 'containers': containers}
            for stackName, containers in sorted(stacksByVm.get(thisVm.id, {}).items())
        ]

        responseData.append({
            'id': thisVm.id,
            'name': thisVm.name,
            'status': status,
            'state': state,
            'enabled': int(thisVm.enabled),
            'owneremail': ownerEmails.get(thisVm.owner_id),
            'stacks': stacks or None,
            'domains': domainsByVm.get(thisVm.id) or None,
            'portforwards': portForwardsByVm.get(thisVm.id) or None,
            'usage': usageByVm.get(thisVm.id),
        })


    # A specific id → the object itself. The access check
    # already guaranteed the row exists — the 404 only guards
    # the race of a delete landing mid-request.
    if virtualServerID is not None:
        if not responseData:
            return JsonResponse({'message': 'Virtual server not found'}, status=404)
        return JsonResponse(responseData[0], json_dumps_params={'indent': 4})

    return JsonResponse(responseData, safe=False, json_dumps_params={'indent': 4})








############################################################
# run_in_background
############################################################
#
# One-shot daemon thread for the slow physical work (a sysbox
# docker run takes a minute, the data archive longer) — the
# request answers 202 immediately and the frontend's 3-second
# poll observes the outcome. Failures are handled INSIDE the
# target (flag revert + activity row); the wrapper only
# guarantees the thread's DB connections are returned.
#
# Deliberately not a job queue: one attempt, state in the
# registry row, reconciliation by the monitor — the same
# pattern the rest of the platform runs on. A deploy landing
# mid-create self-heals (the monitor adopts the finished
# container into the already-committed row).
#
# Used by:
#   - vm_control (below) — the create and delete actions
############################################################

def run_in_background(target):
    def wrapped():
        try:
            target()
        finally:
            close_old_connections()
    threading.Thread(target=wrapped, daemon=True).start()








############################################################
# create_vm_physically / delete_vm_physically
############################################################
#
# The thread targets. Create: one sidecar attempt; failure
# soft-deletes the row again (the "creating" card vanishes on
# the next poll) and logs why. Delete: one sidecar attempt;
# failure REVERTS the deleted flag (the card comes back, the
# user can retry) and logs why — the domains were already
# removed in the request, and stay removed.
#
# Used by:
#   - vm_control (below) via run_in_background
############################################################

def create_vm_physically(virtualServerID, actorUserId):
    containerName = DIND_PREFIX + str(virtualServerID)
    try:
        resp = docker_controller.create_vm(containerName)
        createFailed = resp.status_code != 200
    except requests.RequestException:
        createFailed = True

    with transaction.atomic():
        if createFailed:
            VirtualServer.objects.filter(id=virtualServerID).update(deleted=True, updated_at=timezone.now())
            log_activity(actorUserId, f'Virtual server #{virtualServerID} creation failed')
        else:
            log_activity(actorUserId, f'Virtual server #{virtualServerID} created')



def delete_vm_physically(virtualServerID, actorUserId):
    containerName = DIND_PREFIX + str(virtualServerID)
    try:
        resp = docker_controller.delete_vm(containerName)
        deleteFailed = resp.status_code != 200
    except requests.RequestException:
        deleteFailed = True

    if deleteFailed:
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(deleted=False, updated_at=timezone.now())
            log_activity(actorUserId, f'Virtual server #{virtualServerID} deletion failed')








############################################################
# vm_control
############################################################
#
# POST /api/vm/control — {action, ...}:
#   create {name}                 — any logged-in user
#   start/stop/delete/rename {virtualServerID, [newName]}
#                                 — owner or admin
#
# create and delete are ASYNC: the database change commits,
# the response is 202, and the physical work runs in a
# one-shot background thread — the card shows "creating" (or
# disappears) on the next poll and reverts if the thread
# fails. start/stop/rename stay synchronous (they are fast).
#
# Runs OUTSIDE the request transaction on purpose: on create
# the row must be COMMITTED before the thread starts, so the
# ID is claimed and the monitor can never adopt the new
# container as an ownerless orphan while the create is in
# flight.
#
# Used by:
#   - VirtualServersTable.jsx / VirtualServer.jsx /
#     AddNewVM.jsx
############################################################

@transaction.non_atomic_requests
@login_required
def vm_control(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)
    if postData is None:
        return JsonResponse({'message': 'Invalid request'}, status=400)

    # The id arrives as an integer; a non-numeric value gets a
    # clean 400 instead of a garbage container name downstream
    virtualServerID = postData.get('virtualServerID')
    if virtualServerID is not None:
        try:
            virtualServerID = int(virtualServerID)
        except (TypeError, ValueError):
            return JsonResponse({'message': 'Invalid virtualServerID'}, status=400)
        containerName = DIND_PREFIX + str(virtualServerID)
    action = postData.get('action')



    # --- CREATE ---
    if action == 'create':

        # Validation — on the stripped name, so padding can't
        # smuggle past the 3-char minimum or store padded labels
        if 'name' not in postData:
            return JsonResponse({'message': 'Name is required'}, status=400)

        serverName = postData['name'].strip()
        if len(serverName) < 3:
            return JsonResponse({'message': 'New name must be at least 3 characters long'}, status=400)
        if len(serverName) > 30:
            return JsonResponse({'message': 'Name must be less than 30 characters long'}, status=400)
        for character in serverName:
            if character.lower() not in LITHUANIAN_CHARS:
                return JsonResponse({'message': 'Name can only contain letters, numbers, spaces, underscores and parentheses'}, status=400)

        # Create the row FIRST and commit it, so the ID is
        # claimed before the container exists and the monitor
        # can never adopt it as an orphan
        with transaction.atomic():
            thisVm = VirtualServer.objects.create(
                owner_id=request.current_user.id,
                name=serverName,
                enabled=True,
                deleted=False,
            )
        virtualServerID = thisVm.id

        # The physical build runs in the background — the card
        # shows "creating" on the next poll and either flips to
        # running (monitor sees the container) or vanishes
        # (thread soft-deleted the row and logged why)
        actorUserId = request.current_user.id
        run_in_background(lambda: create_vm_physically(virtualServerID, actorUserId))

        return JsonResponse({'message': 'OK'}, status=202)



    # ------ OTHER ACTIONS REQUIRE AN EXISTING, NON-DELETED VM
    #        AND OWNERSHIP ------
    thisVm = VirtualServer.objects.filter(id=virtualServerID).first()
    if thisVm is None or thisVm.deleted:
        return JsonResponse({'message': 'Virtual server not found'}, status=404)

    if request.current_user.admin == 0 and thisVm.owner_id != request.current_user.id:
        return JsonResponse({'message': 'Unauthorized'}, status=401)



    # --- START ---
    if action == 'start':
        try:
            resp = docker_controller.start_vm(containerName)
        except requests.RequestException:
            return JsonResponse({'message': 'Failed to start virtual server'}, status=500)
        if resp.status_code != 200:
            return JsonResponse({'message': 'Failed to start virtual server'}, status=500)

        # Update database
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(enabled=True, updated_at=timezone.now())
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} started')

        return JsonResponse({'message': 'OK'}, status=200)



    # --- STOP ---
    elif action == 'stop':
        try:
            resp = docker_controller.stop_vm(containerName)
        except requests.RequestException:
            return JsonResponse({'message': 'Failed to stop virtual server'}, status=500)
        if resp.status_code != 200:
            return JsonResponse({'message': 'Failed to stop virtual server'}, status=500)

        # Update database
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(enabled=False, updated_at=timezone.now())
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} stopped')

        return JsonResponse({'message': 'OK'}, status=200)



    # --- DELETE ---
    elif action == 'delete':

        # The intent commits NOW: the card disappears on the
        # next poll and the domains and public ports are freed
        # immediately (the global uniqueness must not be held
        # by a dying VM). The cache rows are the monitor's to
        # prune.
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(deleted=True, updated_at=timezone.now())
            DomainName.objects.filter(virtual_server_id=virtualServerID).delete()
            PortForward.objects.filter(virtual_server_id=virtualServerID).delete()
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} deleted')

        # Regenerate the users Caddyfile and the portforwarder
        # Caddyfile so the deleted VM's vhosts and listeners
        # die with the flag, before the slow teardown. A Caddy
        # hiccup must not fail the delete — the next domain or
        # forward change re-syncs anyway.
        try:
            docker_controller.update_caddy_config()
        except Exception as e:
            print(f'Caddy config update after VM delete failed: {e}')
        try:
            docker_controller.update_portforwarder_config()
        except Exception as e:
            print(f'Portforwarder config update after VM delete failed: {e}')

        # The physical teardown (stop + rm + data archive) runs
        # in the background; a failure reverts the flag and the
        # card comes back
        actorUserId = request.current_user.id
        run_in_background(lambda: delete_vm_physically(virtualServerID, actorUserId))

        return JsonResponse({'message': 'OK'}, status=202)



    # --- RENAME ---
    elif action == 'rename':

        # Validation — on the stripped name, like create
        if 'newName' not in postData:
            return JsonResponse({'message': 'New name is required'}, status=400)

        newName = postData['newName'].strip()
        if len(newName) < 3:
            return JsonResponse({'message': 'New name must be at least 3 characters long'}, status=400)
        if len(newName) > 30:
            return JsonResponse({'message': 'New name must be less than 30 characters long'}, status=400)
        for character in newName:
            if character.lower() not in LITHUANIAN_CHARS:
                return JsonResponse({'message': 'New name can only contain letters, numbers, spaces, underscores and parentheses'}, status=400)

        # Update database
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(name=newName, updated_at=timezone.now())
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} renamed to "{newName}"')

        return JsonResponse({'message': 'OK'}, status=200)



    # --- INVALID ---
    else:
        return JsonResponse({'message': 'Invalid action'}, status=400)
