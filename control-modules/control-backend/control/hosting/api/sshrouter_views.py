############################################################
#  [*] SSH router view — upstream data for server<N> logins
#
#  Called by the external hosting-users-ssh-router container
#  (never by browsers) with a shared API key — compared in
#  constant time, and the endpoint fails CLOSED when the key
#  is not configured. A user SSHes to port 10022 as server<N>
#  with their panel password; the router asks here for the
#  owner's bcrypt hash to verify against, plus the upstream
#  dind container to proxy into. Any non-200 answer denies
#  the login.
#
#  Deleted VMs answer 404, and a disabled owner gets a null
#  hash — disabling an account cuts off SSH exactly like it
#  cuts off the panel. An unknown server id answers a clean
#  404, never a crash.
#
#  Used by:
#    - hosting-users-ssh-router — BACKEND_SSH_API_URL
############################################################

import hmac
import os

from django.http import JsonResponse

from control.common.auth import get_json
from control.hosting.models import VirtualServer


BACKEND_SSH_API_KEY = os.getenv('BACKEND_SSH_API_KEY')








############################################################
# sshrouter
############################################################

def sshrouter(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)


    # STEP 1: Validate username
    if not postData or 'username' not in postData:
        return JsonResponse({'message': 'Username is required'}, status=400)
    if not postData['username'].startswith('server'):
        return JsonResponse({'message': 'Username must start with "server"'}, status=400)


    # STEP 2: Validate API key — constant-time compare, and
    # fail CLOSED if the key was never configured (a plain ==
    # would let "api_key": null match an unset env var)
    if not BACKEND_SSH_API_KEY:
        return JsonResponse({'message': 'SSH API key is not configured'}, status=503)
    if not isinstance(postData.get('api_key'), str):
        return JsonResponse({'message': 'API key is required'}, status=400)
    if not hmac.compare_digest(postData['api_key'], BACKEND_SSH_API_KEY):
        return JsonResponse({'message': 'Invalid API key'}, status=401)


    # STEP 3: Validate server ID
    serverID = postData['username'].replace('server', '')
    if not serverID.isdigit():
        return JsonResponse({'message': 'Server ID must be a number'}, status=400)
    serverID = int(serverID)


    # STEP 4: Get upstream VM data — the owner's stored hash
    # is what the router verifies the SSH password against.
    # No owner OR a disabled owner yields a null hash, which
    # can never verify — disabling an account ends its SSH
    # access, not just its panel access.
    thisVm = VirtualServer.objects.select_related('owner').filter(id=serverID, deleted=False).first()
    if thisVm is None:
        return JsonResponse({'message': 'Server not found'}, status=404)

    serverData = {
        'password_hash': thisVm.owner.password if thisVm.owner and thisVm.owner.enabled else None,
        'upstream_host': f'hosting-users-dind-{serverID}',
        'upstream_port': '22',
        'upstream_user': 'root',
        'upstream_pass': 'root',
    }


    # STEP 5: Return server data
    return JsonResponse(serverData, json_dumps_params={'indent': 4})
