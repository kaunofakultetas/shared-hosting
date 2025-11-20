import json
import sys
import os
import re
import time
from datetime import datetime, date, timedelta
from subprocess import Popen, PIPE

from flask import Flask, request, jsonify, make_response, Response, redirect, send_file, session
from flask_cors import CORS


# Docker Controller Modules
from modules.caddyfile_updater import CaddyfileUpdater








# Environment variables
APP_DEBUG = os.getenv('APP_DEBUG', 'false').lower() == "true"
ROOT_DIR = os.getenv('ROOT_DIR', '/home/stud/students').rstrip('/')
USERS_VM_DIR = os.getenv('USERS_VM_DIR', 'SERVERS').lstrip('/').rstrip('/')




# Flask vars
app = Flask(__name__)
cors = CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
app.secret_key = b'22ac33b7ee75b031e9cac6fa37a86229443c977d277307f25d8c0a0219d474c3'








# docker run --rm -it -v /:/mounted ubuntu bash

'''
docker run -d \
    --name hosting-user2-dind \
    --runtime=sysbox-runc \
    -v /home/stud/students/environments/user2/apps:/apps \
    -v /home/stud/students/environments/user2/dockge:/dockge \
    -v /home/stud/students/environments/user2/docker:/var/lib/docker \
    -v /home/stud/students/users-sshr/keys/ssh_host_ed25519_key.pub:/home/admin/.ssh/authorized_keys:ro \
    --net filtered-users \
    --restart unless-stopped \
    hosting-user1-dind
'''




@app.route('/api/test', methods=['GET'])
def test_HTTPGET():
    json_obj = {}

    stream = os.popen("echo 'Hello World'")
    output = stream.read()
    json_obj['message'] = output

    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')






@app.route('/api/status/<container_name>', methods=['GET'])
def status_HTTPGET(container_name):
    json_obj = {}
    
    # Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')

    # Get the status of the container
    process = None
    if(container_name == 'host'):
        process = Popen(['docker', 'ps', '-a', '--format', '{{json .}}'], stdout=PIPE, stderr=PIPE)
    else:
        process = Popen(['docker', 'exec', container_name, 'docker', 'ps', '-a', '--format', '{{json .}}'], stdout=PIPE, stderr=PIPE)
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        json_obj['error'] = error.decode('utf-8')
    else:
        json_obj['containers'] = [json.loads(line) for line in output.decode('utf-8').strip().split('\n') if line]

    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')




@app.route('/api/start/<container_name>', methods=['GET'])
def start_HTTPGET(container_name):

    # Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')

    # Start the container
    process = Popen(['docker', 'start', container_name])
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to start {container_name}'}), mimetype='application/json')
    
    return Response(json.dumps({'message': f'{container_name} started'}), mimetype='application/json')



@app.route('/api/stop/<container_name>', methods=['GET'])
def stop_HTTPGET(container_name):

    # Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')

    # Stop the container
    process = Popen(['docker', 'stop', container_name])
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to stop {container_name}'}), mimetype='application/json')
    
    return Response(json.dumps({'message': f'{container_name} stopped'}), mimetype='application/json')






@app.route('/api/delete/<container_name>', methods=['GET'])
def delete_HTTPGET(container_name):
    vm_id = container_name.split('-')[3]
    
    # Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')

    # Stop the container
    process = Popen(['docker', 'stop', container_name])
    output, error = process.communicate()

    # Delete the container
    process = Popen(['docker', 'rm', container_name])
    output, error = process.communicate()

    # Delete the docker directory
    process = Popen(['rm', '-rf', f'{ROOT_DIR}/SERVERS/{vm_id}/docker'])
    output, error = process.communicate()

    # Rename the VM directory to {vm_id}-deleted-YYYYMMDDHHMMSS
    timeNow = datetime.now().strftime("%Y%m%d%H%M%S")
    process = Popen(['mv', f'{ROOT_DIR}/SERVERS/{vm_id}', f'{ROOT_DIR}/SERVERS/{vm_id}-deleted-{timeNow}'])
    output, error = process.communicate()

    # Return the status of the container
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to delete {container_name}'}), mimetype='application/json')
    
    return Response(json.dumps({'message': f'{container_name} deleted'}), mimetype='application/json')







@app.route('/api/create/<container_name>', methods=['GET'])
def create_HTTPGET(container_name):

    # STEP 0: Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')



    # STEP 1: VM ID of the new user virtual server
    vm_id = container_name.split('-')[3]



    # STEP 2: Create the container (Create user virtual server)
    process = Popen([
        'docker', 'run', '-d', 
        '--name', container_name,
        '--runtime=sysbox-runc', 
        '-v', f'{ROOT_DIR}/SERVERS/{vm_id}/apps:/apps',
        '-v', f'{ROOT_DIR}/SERVERS/{vm_id}/docker:/var/lib/docker', 
        '--net', 'filtered-users', 
        '--restart', 'unless-stopped', 
        'hosting-dind-ubuntu'])
    output, error = process.communicate()

    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to create {container_name}'}), mimetype='application/json')



    return Response(json.dumps({'message': f'{container_name} created'}), mimetype='application/json')





@app.route('/api/cleanup/<container_name>', methods=['GET'])
def cleanup_HTTPGET(container_name):

    # Validate the input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')

    # Remove all unused images
    process = Popen(['docker', 'exec', container_name, 'docker', 'system', 'prune', '-a', '-f', '--volumes'])
    output, error = process.communicate()
    if process.returncode != 0:
        return Response(json.dumps({'error': f'Failed to cleanup {container_name}'}), mimetype='application/json')
    
    return Response(json.dumps({'message': f'{container_name} cleaned up'}), mimetype='application/json')







@app.route('/api/updatecaddyconfig', methods=['POST'])
def updatecaddyconfig_HTTPPOST():
    # Get the data from the request
    data = json.loads(request.get_json())

    # Update the Caddyfile configuration
    caddyUpdater = CaddyfileUpdater()
    caddy_config = caddyUpdater.generate_caddyfile(data['domains'])
    caddyUpdater.save_caddyfile(caddy_config)
    response = caddyUpdater.reload_caddy()

    return Response(json.dumps({'message': f'Caddy config updated'}), mimetype='application/json')







if __name__ == '__main__':

    if(len(sys.argv) == 1):
        print("Empty")


    elif(sys.argv[1] == "--http"):
        app.run(host='0.0.0.0', port=8000, debug=APP_DEBUG)


