############################################################
#  [*] Docker controller client — the HTTP sidecar
#
#  The backend never touches docker or the filesystem itself:
#  every physical operation goes over HTTP to the
#  hosting-control-docker sidecar on the isolated network.
#  This module is the one place that URL is spelled.
#
#  Timeouts are sized to what each operation really does (a
#  sysbox `docker run` takes far longer than a start/stop):
#    create 120 s   (docker run of the dind image)
#    start/stop 30 s
#    delete 300 s   (stop + rm + data-directory move)
#    status 10 s    (a `docker ps`)
#
#  Used by:
#    - vm_views — create/start/stop/delete
#    - dns_views + vm_views — update_caddy_config
#    - monitor_containers — get_status
############################################################

import json
import os

import requests


DOCKER_CONTROLLER_HOST = os.getenv('DOCKER_CONTROLLER_HOST', 'hosting-control-docker')
DOCKER_CONTROLLER_PORT = os.getenv('DOCKER_CONTROLLER_PORT', '8000')

BASE_URL = f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}'








############################################################
# Container lifecycle
############################################################
#
# Each returns the sidecar's requests.Response; callers check
# status_code == 200. Network errors raise
# requests.RequestException — callers decide the fallout.
############################################################

def create_vm(containerName):
    return requests.get(f'{BASE_URL}/api/create/{containerName}', timeout=120)



def start_vm(containerName):
    return requests.get(f'{BASE_URL}/api/start/{containerName}', timeout=30)



def stop_vm(containerName):
    return requests.get(f'{BASE_URL}/api/stop/{containerName}', timeout=30)



def delete_vm(containerName):
    return requests.get(f'{BASE_URL}/api/delete/{containerName}', timeout=300)



def get_status(containerName):
    return requests.get(f'{BASE_URL}/api/status/{containerName}', timeout=10)








############################################################
# update_caddy_config
############################################################
#
# Pushes the WHOLE domain table to the sidecar, which renders
# the users Caddyfile and reloads the users Caddy. Raises on
# any non-2xx, so callers inside a request transaction get
# rollback-on-failure — DB and Caddyfile never diverge.
#
# COMPATIBILITY: the payload is a JSON *string* passed to
# requests' json= (double-encoded). That is what the
# sidecar's parser expects — do not "fix" this without
# changing control-docker too.
#
# Used by:
#   - dns_views — after every domain change
#   - vm_views — after a VM delete, so the deleted VM's
#     vhosts die with it
############################################################

def update_caddy_config():
    from control.hosting.models import DomainName

    # iscloudflare/ssl go over the wire as 0/1 integers — the
    # sidecar's renderer predates the boolean columns
    domains = {
        'domains': [
            {
                'id': thisDomain.id,
                'virtualserverid': thisDomain.virtual_server_id,
                'domainname': thisDomain.domain_name,
                'iscloudflare': int(thisDomain.is_cloudflare),
                'ssl': int(thisDomain.ssl),
            }
            for thisDomain in DomainName.objects.order_by('id')
        ]
    }

    response = requests.post(f'{BASE_URL}/api/updatecaddyconfig', json=json.dumps(domains), timeout=30)
    response.raise_for_status()
    return json.loads(response.text)
