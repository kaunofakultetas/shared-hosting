############################################################
#  [*] VM views — the list and the control actions
#
#  GET /api/vm assembles the whole card payload in Python
#  over the containers cache:
#  a VM appears only while its hosting-users-dind-<ID>
#  container is in the cache (so a row alone shows nothing),
#  the id is a STRING, and stacks/domains are null when
#  empty. The frontend polls this every 3 seconds and sorts
#  by id client-side.
#
#  POST /api/vm/control proxies to the docker sidecar. The
#  create flow is the one deliberately re-ordered piece (see
#  vm_control) — everything else answers byte-identically.
#
#  Used by:
#    - VirtualServersTable.jsx — list + card actions
#    - VirtualServer.jsx — the detail page (same endpoint)
############################################################

from django.db import transaction
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
from control.hosting.models import DIND_PREFIX, DockerContainer, DomainName, VirtualServer, VmUsage
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


    # The matching non-deleted VM rows and their owners' emails
    virtualServers = {
        str(thisVm.id): thisVm
        for thisVm in VirtualServer.objects.filter(id__in=[int(vmId) for vmId in dindRows], deleted=False)
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
    for vmIdText in sorted(dindRows, key=int):
        thisVm = virtualServers.get(vmIdText)
        if thisVm is None:
            continue

        # A specific id was asked for — only that one
        if virtualServerID is not None and vmIdText != str(virtualServerID):
            continue

        # Non-admin view of the list — own VMs only
        if virtualServerID is None and showOtherUsersVMs == False and thisVm.owner_id != request.current_user.id:
            continue

        stacks = [
            {'stackname': stackName, 'containers': containers}
            for stackName, containers in sorted(stacksByVm.get(thisVm.id, {}).items())
        ]

        responseData.append({
            'id': thisVm.id,
            'name': thisVm.name,
            'status': dindRows[vmIdText].status,
            'state': dindRows[vmIdText].state,
            'enabled': int(thisVm.enabled),
            'owneremail': ownerEmails.get(thisVm.owner_id),
            'stacks': stacks or None,
            'domains': domainsByVm.get(thisVm.id) or None,
            'usage': usageByVm.get(thisVm.id),
        })


    # A specific id → the object itself; 404 covers both an
    # unknown id and a VM whose container the monitor has not
    # seen yet
    if virtualServerID is not None:
        if not responseData:
            return JsonResponse({'message': 'Virtual server not found'}, status=404)
        return JsonResponse(responseData[0], json_dumps_params={'indent': 4})

    return JsonResponse(responseData, safe=False, json_dumps_params={'indent': 4})








############################################################
# vm_control
############################################################
#
# POST /api/vm/control — {action, ...}:
#   create {name}                 — any logged-in user
#   start/stop/delete/rename {virtualServerID, [newName]}
#                                 — owner or admin
#
# Runs OUTSIDE the request transaction on purpose: on create
# the row must be COMMITTED before the slow sidecar call, so
# the ID is claimed and the monitor can never adopt the new
# container as an ownerless orphan while the create is in
# flight. If the physical create fails, the row is
# soft-deleted again.
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
        containerName = DIND_PREFIX + str(virtualServerID)

        # Create the virtual server physically
        try:
            resp = docker_controller.create_vm(containerName)
            createFailed = resp.status_code != 200
        except requests.RequestException:
            createFailed = True

        # Physical create failed — take the row back out
        if createFailed:
            with transaction.atomic():
                VirtualServer.objects.filter(id=virtualServerID).update(deleted=True, updated_at=timezone.now())
            return JsonResponse({'message': 'Failed to create virtual server'}, status=500)

        # The row was created enabled — only the activity is left
        with transaction.atomic():
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} created')

        return JsonResponse({'message': 'OK'}, status=200)



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
        try:
            resp = docker_controller.delete_vm(containerName)
        except requests.RequestException:
            return JsonResponse({'message': 'Failed to delete virtual server'}, status=500)
        if resp.status_code != 200:
            return JsonResponse({'message': 'Failed to delete virtual server'}, status=500)

        # Update database
        with transaction.atomic():
            VirtualServer.objects.filter(id=virtualServerID).update(deleted=True, updated_at=timezone.now())
            DockerContainer.objects.filter(parent_server_id=virtualServerID).delete()
            DomainName.objects.filter(virtual_server_id=virtualServerID).delete()
            log_activity(request.current_user.id, f'Virtual server #{virtualServerID} deleted')

        # Regenerate the users Caddyfile so the deleted VM's
        # vhosts die with it. The VM
        # is already gone — a Caddy hiccup must not fail the
        # delete, the next domain change re-syncs anyway.
        try:
            docker_controller.update_caddy_config()
        except Exception as e:
            print(f'Caddy config update after VM delete failed: {e}')

        return JsonResponse({'message': 'OK'}, status=200)



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
