############################################################
#  [*] DNS views — domain names of a virtual server
#
#  The domain CRUD. Every successful change pushes the whole
#  domain table to the docker sidecar, which rewrites the
#  users Caddyfile and reloads the users Caddy — and that
#  push happens INSIDE the request transaction, so a Caddy
#  failure rolls the database change back and the two can
#  never diverge.
#
#  PUT and DELETE resolve the domain by (domain id AND
#  virtual server id) — an id belonging to another VM
#  answers 404 instead of touching that VM's domain, so one
#  VM's endpoint can never edit another VM's vhosts.
#
#  Used by:
#    - DomainsListTable.jsx — the grid
#    - AddEditDomain.jsx — the dialog + live validation
############################################################

import re
import urllib.parse

from django.db import IntegrityError, transaction
from django.http import JsonResponse

from control.common.auth import (
    check_user_is_allowed_to_access_vm,
    get_json,
    log_activity,
    login_required,
)
from control.hosting import docker_controller
from control.hosting.models import DomainName








############################################################
# is_domain_valid
############################################################
#
# The domain rules — the error sentences are rendered
# verbatim by the dialog, so treat them as part of the UI:
# 5–39 chars, at least one dot, no "..", [a-zA-Z0-9-_.] only,
# starts and ends with a letter, not taken by ANOTHER VM.
#
# Used by:
#   - dns_isvalid (below) — the live check while typing
#   - vm_dns POST/PUT — the authoritative check
############################################################

def is_domain_valid(virtualServerID, domainname):

    # Domain name must be at least 5 characters long
    if len(domainname) < 5:
        return False, 'Domain name must be at least 5 characters long'

    # Check if domain name is too long
    if len(domainname) >= 40:
        return False, 'Domain name is too long'

    # Must consist at least one dot
    if len(domainname.split('.')) <= 1:
        return False, 'Domain name must consist at least one dot'

    # Check if domain name consists of repeated dots
    if domainname.count('..') > 0:
        return False, 'Domain name cannot consist of repeated dots'

    # Check if domain name consists of allowed characters
    if re.match(r'^[a-zA-Z0-9-_.]+$', domainname) is None:
        return False, 'Invalid characters in domain name'

    # Check if domain starts and ends with character (a-z)
    if not domainname[0].isalpha() or not domainname[-1].isalpha():
        return False, 'Domain name must start and end with characters (a-z)'

    # Check if the domain is already taken. Without a usable
    # VM id every match counts as taken — the safe default
    takenQuery = DomainName.objects.filter(domain_name=domainname)
    try:
        takenQuery = takenQuery.exclude(virtual_server_id=int(virtualServerID))
    except (TypeError, ValueError):
        pass
    if takenQuery.exists():
        return False, 'Domain name is already taken'

    return True, 'Domain name is valid'








############################################################
# dns_isvalid
############################################################
#
# GET /api/vm/dns/isvalid?domainname=&virtualserverid= — the
# live validation the dialog runs on every keystroke. Always
# {isvalid, error_message}; a missing domainname is a clean
# 400, never a crash.
#
# Used by:
#   - AddEditDomain.jsx — useDomainNameValidation
############################################################

@login_required
def dns_isvalid(request):
    domainname = request.GET.get('domainname')
    if domainname is None:
        return JsonResponse({'isvalid': False, 'error_message': 'Missing domainname parameter'}, status=400)

    domainname = urllib.parse.unquote(domainname).lower()
    virtualServerID = request.GET.get('virtualserverid')

    # Check if domain name is valid
    is_valid, error_message = is_domain_valid(virtualServerID, domainname)
    return JsonResponse({'isvalid': is_valid, 'error_message': error_message}, status=200)








############################################################
# vm_dns
############################################################
#
# GET  /api/vm/dns/<vmID>            — the VM's domains
# POST /api/vm/dns/<vmID>            — add    {domainname, iscloudflare, ssl}
# PUT  /api/vm/dns/<vmID>            — edit   {domainid, domainname, iscloudflare, ssl}
# DELETE /api/vm/dns/<vmID>/<domID>  — remove
#
# Owner or admin only. Mutations answer {"message": "ok"}
# after the Caddy push succeeds.
#
# Used by:
#   - DomainsListTable.jsx / AddEditDomain.jsx
############################################################

@login_required
def vm_dns(request, virtualServerID, domainID=None):

    # Check if user is allowed to access specific virtual server
    # The access check also covers existence: unknown and
    # soft-deleted VMs answer 401 for everyone, admins included
    if check_user_is_allowed_to_access_vm(request.current_user, virtualServerID) == False:
        return JsonResponse({'message': 'Unauthorized'}, status=401)



    if request.method == 'GET':
        responseData = [
            {
                'id': thisDomain.id,
                'virtualserverid': thisDomain.virtual_server_id,
                'domainname': thisDomain.domain_name,
                'iscloudflare': int(thisDomain.is_cloudflare),
                'ssl': int(thisDomain.ssl),
            }
            for thisDomain in DomainName.objects.filter(virtual_server_id=virtualServerID).order_by('id')
        ]
        return JsonResponse(responseData, safe=False)



    elif request.method == 'PUT':
        postData = get_json(request)

        # Check if domain name is valid
        is_valid, error_message = is_domain_valid(virtualServerID, postData['domainname'])
        if is_valid == False:
            return JsonResponse({'message': 'Error', 'reason': error_message}, status=400)

        # Update the domain name — scoped to THIS virtual
        # server, so a foreign domain id changes nothing
        updated = DomainName.objects.filter(id=postData['domainid'], virtual_server_id=virtualServerID).update(
            domain_name=postData['domainname'].lower(),
            is_cloudflare=bool(postData['iscloudflare']),
            ssl=bool(postData['ssl']),
        )
        if updated == 0:
            return JsonResponse({'message': 'Error', 'reason': 'Domain not found'}, status=404)

        log_activity(request.current_user.id, f'Domain name "{postData["domainname"]}" updated for virtual server #{virtualServerID}')
        docker_controller.update_caddy_config()
        return JsonResponse({'message': 'ok'}, status=200)



    elif request.method == 'POST':
        postData = get_json(request)

        # Check if domain name is valid
        is_valid, error_message = is_domain_valid(virtualServerID, postData['domainname'])
        if is_valid == False:
            return JsonResponse({'message': 'Error', 'reason': error_message}, status=400)

        # Insert the domain name — the same domain twice on the
        # SAME VM passes is_domain_valid but hits the global
        # unique constraint; answer like any taken domain
        try:
            with transaction.atomic():
                DomainName.objects.create(
                    virtual_server_id=virtualServerID,
                    domain_name=postData['domainname'].lower(),
                    is_cloudflare=bool(postData['iscloudflare']),
                    ssl=bool(postData['ssl']),
                )
        except IntegrityError:
            return JsonResponse({'message': 'Error', 'reason': 'Domain name is already taken'}, status=400)

        log_activity(request.current_user.id, f'Domain name "{postData["domainname"]}" added for virtual server #{virtualServerID}')
        docker_controller.update_caddy_config()
        return JsonResponse({'message': 'ok'}, status=200)



    elif request.method == 'DELETE':

        # Scoped to THIS virtual server, like PUT
        thisDomain = DomainName.objects.filter(id=domainID, virtual_server_id=virtualServerID).first()
        if thisDomain is None:
            return JsonResponse({'message': 'Error', 'reason': 'Domain not found'}, status=404)

        domainName = thisDomain.domain_name
        thisDomain.delete()

        log_activity(request.current_user.id, f'Domain name "{domainName}" deleted for virtual server #{virtualServerID}')
        docker_controller.update_caddy_config()
        return JsonResponse({'message': 'ok'}, status=200)



    return JsonResponse({'message': 'Method not allowed'}, status=405)
