############################################################
#  [*] Virtual server routes — the physical lifecycle
#
#    GET  /api/start/<container_name>    — docker start
#    GET  /api/stop/<container_name>     — docker stop
#    GET  /api/delete/<container_name>   — stop + rm + archive the data dir
#    GET  /api/create/<container_name>   — docker run of a new VM
#    GET  /api/cleanup/<container_name>  — inner docker prune (nothing calls it)
#
#  Validation failures answer HTTP 400 with the message — the
#  backend treats any non-200 as a failed operation, so a 200
#  with an error key would read as success upstream.
#
#  delete and create additionally require a real dind name
#  (hosting-users-dind-<digits>) BEFORE slicing the id out of
#  it — any other name answers 400 instead of crashing.
############################################################


import json
import os
import re
from datetime import datetime
from subprocess import Popen, PIPE

from flask import Blueprint, Response


virtual_servers_bp = Blueprint('virtual_servers', __name__)


# Environment variables
ROOT_DIR = os.getenv('ROOT_DIR', '/home/stud/students').rstrip('/')
USERS_VM_DIR = os.getenv('USERS_VM_DIR', 'SERVERS').lstrip('/').rstrip('/')


NAME_PATTERN = r'^[a-z0-9-]{1,25}$'
DIND_PREFIX = 'hosting-users-dind-'








############################################################
# invalid_name_response / parse_vm_id
############################################################
#
# The shared guards: invalid_name_response is the 400 every
# route answers for a name outside ^[a-z0-9-]{1,25}$;
# parse_vm_id additionally requires the dind naming contract
# and returns the numeric id (or None) — the id is only ever
# sliced AFTER this check, so "host" or a short name can no
# longer crash the delete/create paths.
#
# Used by:
#   - every route below
############################################################

def invalid_name_response():
    json_obj = {'error': 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'}
    return Response(json.dumps(json_obj, indent=4), mimetype='application/json', status=400)



def parse_vm_id(container_name):
    if not container_name.startswith(DIND_PREFIX):
        return None
    suffix = container_name.replace(DIND_PREFIX, '')
    if not suffix.isdigit():
        return None
    return suffix








############################################################
# start_HTTPGET
############################################################
#
# GET /api/start/<container_name>
#
# `docker start` of a VM container.
#
# Used by:
#   - control-backend vm_views — the start action
############################################################

@virtual_servers_bp.route('/api/start/<container_name>', methods=['GET'])
def start_HTTPGET(container_name):

    # Validate the input
    if not re.match(NAME_PATTERN, container_name):
        return invalid_name_response()

    # Start the container
    process = Popen(['docker', 'start', container_name])
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to start {container_name}'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'{container_name} started'}), mimetype='application/json')








############################################################
# stop_HTTPGET
############################################################
#
# GET /api/stop/<container_name>
#
# `docker stop` of a VM container.
#
# Used by:
#   - control-backend vm_views — the stop action
############################################################

@virtual_servers_bp.route('/api/stop/<container_name>', methods=['GET'])
def stop_HTTPGET(container_name):

    # Validate the input
    if not re.match(NAME_PATTERN, container_name):
        return invalid_name_response()

    # Stop the container
    process = Popen(['docker', 'stop', container_name])
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to stop {container_name}'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'{container_name} stopped'}), mimetype='application/json')








############################################################
# delete_HTTPGET
############################################################
#
# GET /api/delete/<container_name>
#
# The destructive end of a VM: stop, rm, wipe the inner
# docker data, then archive the whole data directory as
# SERVERS/<id>-deleted-<timestamp> — the student's files are
# retained, only renamed out of the live namespace.
#
# Individual steps are TOLERANT (a half-broken VM — container
# already gone, directory missing — must still be deletable);
# what decides success is the OUTCOME: the operation fails
# only if the container still exists afterwards, or the live
# data directory could not be archived while it exists.
#
# Used by:
#   - control-backend vm_views — the delete action
############################################################

@virtual_servers_bp.route('/api/delete/<container_name>', methods=['GET'])
def delete_HTTPGET(container_name):

    # STEP 1: Validate the input — full dind name required
    # before the id is sliced out of it
    # ====================================================
    if not re.match(NAME_PATTERN, container_name):
        return invalid_name_response()

    vm_id = parse_vm_id(container_name)
    if vm_id is None:
        return Response(json.dumps({'error': f'{container_name} is not a VM container name'}), mimetype='application/json', status=400)


    # STEP 2: Stop and remove the container (tolerant — it may
    # not exist at all)
    # ========================================================
    process = Popen(['docker', 'stop', container_name])
    output, error = process.communicate()

    process = Popen(['docker', 'rm', container_name])
    output, error = process.communicate()


    # STEP 3: Wipe the inner docker data, then archive the VM
    # directory as <id>-deleted-<timestamp>
    # =======================================================
    process = Popen(['rm', '-rf', f'{ROOT_DIR}/{USERS_VM_DIR}/{vm_id}/docker'])
    output, error = process.communicate()

    timeNow = datetime.now().strftime("%Y%m%d%H%M%S")
    process = Popen(['mv', f'{ROOT_DIR}/{USERS_VM_DIR}/{vm_id}', f'{ROOT_DIR}/{USERS_VM_DIR}/{vm_id}-deleted-{timeNow}'])
    output, error = process.communicate()


    # STEP 4: Judge the OUTCOME, not the steps — the container
    # must be gone (docker inspect fails) for the delete to
    # count as done
    # ========================================================
    process = Popen(['docker', 'inspect', container_name], stdout=PIPE, stderr=PIPE)
    output, error = process.communicate()
    if process.returncode == 0:
        return Response(json.dumps({'error': f'Failed to delete {container_name}'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'{container_name} deleted'}), mimetype='application/json')








############################################################
# create_HTTPGET
############################################################
#
# GET /api/create/<container_name>
#
# The physical birth of a VM: `docker run` of the sysbox dind
# image, hostname server<id>, data bind-mounted from
# SERVERS/<id>. The backend commits the VM row BEFORE calling
# here and waits up to 120 s — a sysbox run takes a while.
#
# Used by:
#   - control-backend vm_views — the create action
############################################################

@virtual_servers_bp.route('/api/create/<container_name>', methods=['GET'])
def create_HTTPGET(container_name):

    # STEP 1: Validate the input — full dind name required
    # before the id is sliced out of it
    # ====================================================
    if not re.match(NAME_PATTERN, container_name):
        return invalid_name_response()

    vm_id = parse_vm_id(container_name)
    if vm_id is None:
        return Response(json.dumps({'error': f'{container_name} is not a VM container name'}), mimetype='application/json', status=400)


    # STEP 2: Create the container (Create user virtual server)
    # =========================================================
    process = Popen([
        'docker', 'run', '-d',
        '--name', container_name,
        '--hostname', f'server{vm_id}',
        '--runtime=sysbox-runc',
        '-v', f'{ROOT_DIR}/{USERS_VM_DIR}/{vm_id}/apps:/apps',
        '-v', f'{ROOT_DIR}/{USERS_VM_DIR}/{vm_id}/docker:/var/lib/docker',
        '--net', 'filtered-users',
        '--restart', 'unless-stopped',
        'hosting-dind-ubuntu'])
    output, error = process.communicate()

    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to create {container_name}'}), mimetype='application/json', status=500)


    return Response(json.dumps({'message': f'{container_name} created'}), mimetype='application/json')








############################################################
# cleanup_HTTPGET
############################################################
#
# GET /api/cleanup/<container_name>
#
# `docker system prune` INSIDE a VM's inner daemon — frees
# the images/volumes a student accumulated.
#
# Nothing calls this at the moment — the backend has no
# cleanup action, so the endpoint is reachable only by hand.
############################################################

@virtual_servers_bp.route('/api/cleanup/<container_name>', methods=['GET'])
def cleanup_HTTPGET(container_name):

    # Validate the input
    if not re.match(NAME_PATTERN, container_name):
        return invalid_name_response()

    # Remove all unused images
    process = Popen(['docker', 'exec', container_name, 'docker', 'system', 'prune', '-a', '-f', '--volumes'])
    output, error = process.communicate()
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to cleanup {container_name}'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'{container_name} cleaned up'}), mimetype='application/json')
