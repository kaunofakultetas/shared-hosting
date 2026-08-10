############################################################
#  [*] Status routes — the read-only probes
#
#    GET  /api/test                     — hello (nothing calls it)
#    GET  /api/status/<container_name>  — docker ps, host or inside one VM
#
#  The status answer is reshaped into the legacy `docker ps
#  --format json` field names the whole platform renders
#  verbatim.
############################################################


import json
import os
import re
import requests
import requests_unixsocket
from datetime import datetime, timezone

from flask import Blueprint, Response


status_bp = Blueprint('status', __name__)








############################################################
# test_HTTPGET
############################################################
#
# GET /api/test
#
# Hello-world probe kept from the first bring-up.
#
# Used by:
#   - nothing calls this at the moment
############################################################

@status_bp.route('/api/test', methods=['GET'])
def test_HTTPGET():
    json_obj = {}

    stream = os.popen("echo 'Hello World'")
    output = stream.read()
    json_obj['message'] = output

    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')








############################################################
# newstatus_HTTPGET
############################################################
#
# GET /api/status/<container_name>
#
# `docker ps` as JSON — "host" lists the host daemon through
# the unix socket; any other name is treated as a dind VM and
# its INNER daemon is queried through the dockersocket Caddy
# (which routes by the virtual-server-id cookie). The Docker
# API answer is reshaped into the legacy `docker ps --format
# json` field names.
#
# Reshaping quirks worth knowing: RunningFor is derived from
# the Created timestamp (so it reads "since created", not
# "since started" — the list API carries no started-at), Size
# is always "N/A", and volume mounts are counted but their
# sources hidden (LocalVolumes).
#
# Used by:
#   - control-backend monitor_containers — every 3 s for the
#     host and again for every running VM
############################################################

@status_bp.route('/api/status/<container_name>', methods=['GET'])
def newstatus_HTTPGET(container_name):
    json_obj = {}

    # STEP 1: Validate the container name
    # ==================================
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json', status=400)


    # STEP 2: Fetch the container list — host socket directly,
    # or the VM's inner daemon through the dockersocket proxy
    # ========================================================
    response = None
    if(container_name == 'host'):
        session = requests_unixsocket.Session()
        response = session.get('http+unix://%2Fvar%2Frun%2Fdocker.sock/containers/json?all=1', timeout=2)
    else:
        # Anything that is not "host" must be a full dind name —
        # checked BEFORE the id is sliced out of it
        if not container_name.startswith('hosting-users-dind-') or not container_name.replace('hosting-users-dind-', '').isdigit():
            return Response(json.dumps({'error': f'{container_name} is not a VM container name'}, indent=4), mimetype='application/json', status=400)

        vm_id = container_name.replace('hosting-users-dind-', '')
        api_url = f'http://hosting-control-dockersocket:80/dockersocket/containers/json?all=1'
        response = requests.get(api_url, cookies={'virtual-server-id': vm_id}, timeout=2)


    # STEP 3: Validate the response and parse it
    # ==========================================
    if response.status_code != 200:
        return Response(json.dumps({'error': f'Error from {container_name}: {response.status_code}'}), mimetype='application/json')
    response = response.text
    response_json = json.loads(response)


    # STEP 4: Reshape every container into the legacy Docker
    # CLI json format
    # ======================================================
    containers = []
    for container in response_json:
        status = container.get('Status', '')
        state = container.get('State', '')

        # Networks: comma-joined names
        networks = ",".join(container.get('NetworkSettings', {}).get('Networks', {}).keys())

        # Ports: rebuild the CLI notation, including the
        # bracketed [::] IPv6 form
        ports = []
        for p in container.get('Ports', []):
            private_port = p.get('PrivatePort')
            public_port = p.get('PublicPort')
            type_ = p.get('Type')
            ip = p.get('IP')

            if public_port:
                if ip == '0.0.0.0':
                    ports.append(f"{ip}:{public_port}->{private_port}/{type_}")
                elif ip == '::':
                    ports.append(f"[{ip}]:{public_port}->{private_port}/{type_}") # Match [::] format
                else:
                    ports.append(f"{public_port}->{private_port}/{type_}")
            else:
                ports.append(f"{private_port}/{type_}")
        ports_str = ", ".join(ports)

        # Mounts: bind sources comma-joined; named volumes are
        # only COUNTED (LocalVolumes) like the CLI does, their
        # sources stay hidden
        mounts = []
        local_volumes = 0
        for m in container.get('Mounts', []):
            src = m.get('Source', '')
            mount_type = m.get('Type', '')

            if mount_type == 'volume':
                local_volumes += 1
                pass
            else:
                mounts.append(src)
        mounts_str = ",".join(mounts)

        # Labels: comma-joined k=v (the backend later slices
        # com.docker.compose.project out of this)
        labels = []
        for k, v in container.get('Labels', {}).items():
            labels.append(f"{k}={v}")
        labels_str = ",".join(labels)

        # Command: the CLI wraps it in quotes
        cmd = container.get('Command', '')
        if not cmd.startswith('"'):
            cmd = f'"{cmd}"'

        # CreatedAt: real UTC now, so the legacy "+0000 UTC"
        # suffix finally tells the truth
        created_ts = container.get('Created')
        created_str = datetime.fromtimestamp(created_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S +0000 UTC')

        # RunningFor: approximated from Created (the API has no
        # "started" timestamp here), so it reads "since created"
        now = datetime.now()
        created_dt = datetime.fromtimestamp(created_ts)
        diff = now - created_dt

        if diff.days > 0:
            running_for = f"{diff.days} days ago"
        elif diff.seconds >= 3600:
            running_for = f"{diff.seconds // 3600} hours ago"
        elif diff.seconds >= 60:
            running_for = f"{diff.seconds // 60} minutes ago"
        else:
            running_for = "Less than a minute ago"

        legacy_container = {
            "Command": cmd,
            "CreatedAt": created_str,
            "ID": container.get('Id'),
            "Image": container.get('Image'),
            "Labels": labels_str,
            "LocalVolumes": str(local_volumes),
            "Mounts": mounts_str,
            "Names": (container.get('Names', [''])[0]).lstrip('/'),
            "Networks": networks,
            "Ports": ports_str,
            "RunningFor": running_for,
            "Size": "N/A",
            "State": state,
            "Status": status
        }
        containers.append(legacy_container)


    # STEP 5: Return the reshaped list
    # ================================
    json_obj['containers'] = containers
    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')
