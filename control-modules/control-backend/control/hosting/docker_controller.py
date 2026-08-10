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
# get_disk_usage
############################################################
#
# The sidecar's du sweep over /SERVERS: {"usage": {"<id>":
# <bytes>}} for every live VM directory. A du over the inner
# docker trees can take a while — the generous timeout is
# fine because the monitor calls this from a background
# thread, never from a request.
#
# Used by:
#   - monitor_containers — the ~5-minute disk refresh
############################################################

def get_disk_usage():
    return requests.get(f'{BASE_URL}/api/usage/disk', timeout=240)








############################################################
# update_caddy_config
############################################################
#
# Pushes the WHOLE domain table to the sidecar, which renders
# the users Caddyfile and reloads the users Caddy. Raises on
# any non-2xx, so callers inside a request transaction get
# rollback-on-failure — DB and Caddyfile never diverge.
#
# The payload is the plain JSON object {"domains": [...]} —
# the sidecar answers 500 when the caddy reload fails, and
# the raise_for_status below is what turns that into the
# backend-side transaction rollback.
#
# Used by:
#   - dns_views — after every domain change
#   - vm_views — after a VM delete, so the deleted VM's
#     vhosts die with it
############################################################

def update_caddy_config():
    from control.hosting.models import DomainName

    # iscloudflare/ssl go over the wire as 0/1 integers — the
    # sidecar's renderer compares against 1 literally
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

    response = requests.post(f'{BASE_URL}/api/updatecaddyconfig', json=domains, timeout=30)
    response.raise_for_status()
    return json.loads(response.text)
