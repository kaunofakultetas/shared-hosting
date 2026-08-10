############################################################
#  [*] SSH router view — upstream data for server<N> logins
#
#  Called by the external hosting-users-ssh-router container
#  (never by browsers) with a shared API key. A user SSHes to
#  port 10022 as server<N> with their panel password; the
#  router asks here for the owner's bcrypt hash to verify
#  against, plus the upstream dind container to proxy into.
#  Any non-200 answer denies the login.
#
#  An unknown server id answers a clean 404, never a crash.
#
#  Used by:
#    - hosting-users-ssh-router — BACKEND_SSH_API_URL
############################################################

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


    # STEP 2: Validate API key
    if 'api_key' not in postData:
        return JsonResponse({'message': 'API key is required'}, status=400)
    if postData['api_key'] != BACKEND_SSH_API_KEY:
        return JsonResponse({'message': 'Invalid API key'}, status=401)


    # STEP 3: Validate server ID
    serverID = postData['username'].replace('server', '')
    if not serverID.isdigit():
        return JsonResponse({'message': 'Server ID must be a number'}, status=400)
    serverID = int(serverID)


    # STEP 4: Get upstream VM data — the owner's stored hash
    # is what the router verifies the SSH password against.
    # A VM without an owner yields a null hash, which can
    # never verify.
    thisVm = VirtualServer.objects.select_related('owner').filter(id=serverID).first()
    if thisVm is None:
        return JsonResponse({'message': 'Server not found'}, status=404)

    serverData = {
        'password_hash': thisVm.owner.password if thisVm.owner else None,
        'upstream_host': f'hosting-users-dind-{serverID}',
        'upstream_port': '22',
        'upstream_user': 'root',
        'upstream_pass': 'root',
    }


    # STEP 5: Return server data
    return JsonResponse(serverData, json_dumps_params={'indent': 4})
