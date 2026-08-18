############################################################
#  [*] Port forward views — public TCP ports of a VM
#
#  The port forward CRUD. Every successful change pushes the
#  whole forward table to the docker sidecar, which rewrites
#  the portforwarder Caddyfile and reloads the portforwarder
#  Caddy — and that push happens INSIDE the request
#  transaction, so a reload failure rolls the database change
#  back and the two can never diverge (the dns_views pattern
#  exactly).
#
#  The public pool is PORTFORWARD_RANGE_START..END — the SAME
#  env values docker-compose publishes on the portforwarder
#  container, so a port this API accepts is always a port the
#  host actually listens on.
#
#  PUT and DELETE resolve the forward by (forward id AND
#  virtual server id) — an id belonging to another VM answers
#  404 instead of touching that VM's forwards, so one VM's
#  endpoint can never edit another VM's ports.
#
#  Used by:
#    - PortForwardsListTable.jsx — the grid
#    - AddEditPortForward.jsx — the dialog + live validation
############################################################

import os

from django.db import IntegrityError, transaction
from django.http import JsonResponse

from control.common.auth import (
    check_user_is_allowed_to_access_vm,
    get_json,
    log_activity,
    login_required,
)
from control.hosting import docker_controller
from control.hosting.models import PortForward


# The public pool — must mirror the range docker-compose
# publishes on hosting-users-portforwarder (same env vars,
# same defaults)
PORTFORWARD_RANGE_START = int(os.getenv('PORTFORWARD_RANGE_START', '30000'))
PORTFORWARD_RANGE_END = int(os.getenv('PORTFORWARD_RANGE_END', '30029'))

# The hostname shown next to every public port in the UI —
# the user-apps IP, where the router forwards the pool
PORTFORWARD_PUBLIC_HOST = os.getenv('PORTFORWARD_PUBLIC_HOST', 'knf-hosting.lt')

# One VM cannot hoard the shared pool
MAX_FORWARDS_PER_VM = 5








############################################################
# is_port_forward_valid
############################################################
#
# The port rules — the error sentences are rendered verbatim
# by the dialog, so treat them as part of the UI: both ports
# must be integers, the public port inside the published
# pool, the internal port a real TCP port, and the public
# port not taken by any other forward.
#
# excludePortForwardID is the edit case: the row being edited
# may keep its own public port. A non-numeric exclude id is
# ignored — every match then counts as taken, the safe
# default.
#
# Used by:
#   - portforward_isvalid (below) — the live check while
#     typing
#   - vm_portforward POST/PUT — the authoritative check
############################################################

def is_port_forward_valid(publicPort, internalPort, excludePortForwardID=None):

    # Public port must be an integer
    try:
        publicPort = int(publicPort)
    except (TypeError, ValueError):
        return False, 'Public port must be a number'

    # Public port must live inside the published pool
    if publicPort < PORTFORWARD_RANGE_START or publicPort > PORTFORWARD_RANGE_END:
        return False, f'Public port must be between {PORTFORWARD_RANGE_START} and {PORTFORWARD_RANGE_END}'

    # Internal port must be an integer
    try:
        internalPort = int(internalPort)
    except (TypeError, ValueError):
        return False, 'Internal port must be a number'

    # Internal port must be a real TCP port
    if internalPort < 1 or internalPort > 65535:
        return False, 'Internal port must be between 1 and 65535'

    # Check if the public port is already taken. Without a
    # usable exclude id every match counts as taken — the
    # safe default
    takenQuery = PortForward.objects.filter(public_port=publicPort)
    try:
        takenQuery = takenQuery.exclude(id=int(excludePortForwardID))
    except (TypeError, ValueError):
        pass
    if takenQuery.exists():
        return False, 'Public port is already taken'

    return True, 'Port forward is valid'








############################################################
# portforward_isvalid
############################################################
#
# GET /api/vm/portforward/isvalid?publicport=&internalport=
#     [&portforwardid=]
#
# The live validation the dialog runs on every keystroke.
# Always {isvalid, error_message}; missing parameters are a
# clean 400, never a crash. The edit dialog passes the row's
# own id so keeping the same public port stays valid.
#
# Used by:
#   - AddEditPortForward.jsx — usePortForwardValidation
############################################################

@login_required
def portforward_isvalid(request):
    publicPort = request.GET.get('publicport')
    internalPort = request.GET.get('internalport')
    if publicPort is None or internalPort is None:
        return JsonResponse({'isvalid': False, 'error_message': 'Missing publicport or internalport parameter'}, status=400)

    excludePortForwardID = request.GET.get('portforwardid')

    # Check if the port forward is valid
    is_valid, error_message = is_port_forward_valid(publicPort, internalPort, excludePortForwardID)
    return JsonResponse({'isvalid': is_valid, 'error_message': error_message}, status=200)








############################################################
# vm_portforward
############################################################
#
# GET  /api/vm/portforward/<vmID>          — the VM's forwards
# POST /api/vm/portforward/<vmID>          — add  {publicport, internalport, description}
# PUT  /api/vm/portforward/<vmID>          — edit {portforwardid, publicport, internalport, description}
# DELETE /api/vm/portforward/<vmID>/<pfID> — remove
#
# Owner or admin only. Mutations answer {"message": "ok"}
# after the portforwarder push succeeds. POST additionally
# enforces the per-VM quota; the IntegrityError catches cover
# the race two requests can win against the same port.
#
# Used by:
#   - PortForwardsListTable.jsx / AddEditPortForward.jsx
############################################################

@login_required
def vm_portforward(request, virtualServerID, portForwardID=None):

    # Check if user is allowed to access specific virtual server
    # The access check also covers existence: unknown and
    # soft-deleted VMs answer 401 for everyone, admins included
    if check_user_is_allowed_to_access_vm(request.current_user, virtualServerID) == False:
        return JsonResponse({'message': 'Unauthorized'}, status=401)



    if request.method == 'GET':
        responseData = [
            {
                'id': thisForward.id,
                'virtualserverid': thisForward.virtual_server_id,
                'publichost': PORTFORWARD_PUBLIC_HOST,
                'publicport': thisForward.public_port,
                'internalport': thisForward.internal_port,
                'description': thisForward.description,
            }
            for thisForward in PortForward.objects.filter(virtual_server_id=virtualServerID).order_by('id')
        ]
        return JsonResponse(responseData, safe=False)



    elif request.method == 'PUT':
        postData = get_json(request)

        # Check if the port forward is valid — the row's own id
        # is excluded, so keeping the same public port passes
        is_valid, error_message = is_port_forward_valid(postData['publicport'], postData['internalport'], postData['portforwardid'])
        if is_valid == False:
            return JsonResponse({'message': 'Error', 'reason': error_message}, status=400)

        description = str(postData.get('description', '')).strip()
        if len(description) > 100:
            return JsonResponse({'message': 'Error', 'reason': 'Description is too long'}, status=400)

        # Update the forward — scoped to THIS virtual server,
        # so a foreign forward id changes nothing. The savepoint
        # makes catching the port race safe mid-transaction.
        try:
            with transaction.atomic():
                updated = PortForward.objects.filter(id=postData['portforwardid'], virtual_server_id=virtualServerID).update(
                    public_port=int(postData['publicport']),
                    internal_port=int(postData['internalport']),
                    description=description,
                )
        except IntegrityError:
            return JsonResponse({'message': 'Error', 'reason': 'Public port is already taken'}, status=400)
        if updated == 0:
            return JsonResponse({'message': 'Error', 'reason': 'Port forward not found'}, status=404)

        log_activity(request.current_user.id, f'Port forward {int(postData["publicport"])}→{int(postData["internalport"])} updated for virtual server #{virtualServerID}')
        docker_controller.update_portforwarder_config()
        return JsonResponse({'message': 'ok'}, status=200)



    elif request.method == 'POST':
        postData = get_json(request)

        # Check if the port forward is valid
        is_valid, error_message = is_port_forward_valid(postData['publicport'], postData['internalport'])
        if is_valid == False:
            return JsonResponse({'message': 'Error', 'reason': error_message}, status=400)

        description = str(postData.get('description', '')).strip()
        if len(description) > 100:
            return JsonResponse({'message': 'Error', 'reason': 'Description is too long'}, status=400)

        # The pool is shared by every VM — a per-VM cap keeps
        # one server from hoarding it
        if PortForward.objects.filter(virtual_server_id=virtualServerID).count() >= MAX_FORWARDS_PER_VM:
            return JsonResponse({'message': 'Error', 'reason': f'Port forward limit reached ({MAX_FORWARDS_PER_VM} per server)'}, status=400)

        # Insert the forward — a concurrent request winning the
        # same port passes is_port_forward_valid but hits the
        # unique constraint; answer like any taken port
        try:
            with transaction.atomic():
                PortForward.objects.create(
                    virtual_server_id=virtualServerID,
                    public_port=int(postData['publicport']),
                    internal_port=int(postData['internalport']),
                    description=description,
                )
        except IntegrityError:
            return JsonResponse({'message': 'Error', 'reason': 'Public port is already taken'}, status=400)

        log_activity(request.current_user.id, f'Port forward {int(postData["publicport"])}→{int(postData["internalport"])} added for virtual server #{virtualServerID}')
        docker_controller.update_portforwarder_config()
        return JsonResponse({'message': 'ok'}, status=200)



    elif request.method == 'DELETE':

        # Scoped to THIS virtual server, like PUT
        thisForward = PortForward.objects.filter(id=portForwardID, virtual_server_id=virtualServerID).first()
        if thisForward is None:
            return JsonResponse({'message': 'Error', 'reason': 'Port forward not found'}, status=404)

        publicPort = thisForward.public_port
        internalPort = thisForward.internal_port
        thisForward.delete()

        log_activity(request.current_user.id, f'Port forward {publicPort}→{internalPort} deleted for virtual server #{virtualServerID}')
        docker_controller.update_portforwarder_config()
        return JsonResponse({'message': 'ok'}, status=200)



    return JsonResponse({'message': 'Method not allowed'}, status=405)
