import json
import sys
import os
import re
import time
import requests
import requests_unixsocket
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








@app.route('/api/test', methods=['GET'])
def test_HTTPGET():
    json_obj = {}

    stream = os.popen("echo 'Hello World'")
    output = stream.read()
    json_obj['message'] = output

    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')





@app.route('/api/status/<container_name>', methods=['GET'])
def newstatus_HTTPGET(container_name):
    json_obj = {}
    
    # STEP 0: Validate "container name" input
    if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
        json_obj['error'] = 'Invalid container name. Must be lowercase letters, numbers, hyphens, and up to 25 characters.'
        return Response(json.dumps(json_obj, indent=4), mimetype='application/json')




    # STEP 1: Fetch data from the appropriate API endpoint
    response = None
    if(container_name == 'host'):
        # STEP 1.1: Fetch data from the host API endpoint
        session = requests_unixsocket.Session()
        response = session.get('http+unix://%2Fvar%2Frun%2Fdocker.sock/containers/json?all=1', timeout=2)
    else:
        # STEP 1.1: Fetch data from the VM API endpoint
        vm_id = container_name.split('-')[3]
        api_url = f'http://hosting-control-dockersocket:80/dockersocket/containers/json?all=1'
        response = requests.get(api_url, cookies={'virtual-server-id': vm_id}, timeout=2)




    # STEP 2: Validate the response and parse it to the JSON object
    if response.status_code != 200:
        return Response(json.dumps({'error': f'Error from {container_name}: {response.status_code}'}), mimetype='application/json')
    response = response.text
    response_json = json.loads(response)




    # STEP 3: Map Docker API response to legacy format (Docker CLI json format)
    containers = []
    for container in response_json:
        # Calculate running status
        status = container.get('Status', '')
        state = container.get('State', '')
        
        # Format networks string
        networks = ",".join(container.get('NetworkSettings', {}).get('Networks', {}).keys())
        
        # Format ports string
        ports = []
        for p in container.get('Ports', []):
            private_port = p.get('PrivatePort')
            public_port = p.get('PublicPort')
            type_ = p.get('Type')
            ip = p.get('IP')
            
            # Match old format style roughly
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

        # Format mounts string (Legacy: comma separated sources)
        # Also count LocalVolumes (Type == 'volume')
        mounts = []
        local_volumes = 0
        for m in container.get('Mounts', []):
            src = m.get('Source', '')
            mount_type = m.get('Type', '')
            
            if mount_type == 'volume':
                local_volumes += 1
                # Legacy often showed volume name or path. 
                # If Name exists and is long hash, maybe show Name, otherwise Source.
                # For now, Source is safe.
                # mounts.append(src) # Don't append volume sources to match legacy "LocalVolumes: 1" hiding details
                pass
            else:
                mounts.append(src)
        mounts_str = ",".join(mounts)

        # Format labels string
        labels = []
        for k, v in container.get('Labels', {}).items():
            labels.append(f"{k}={v}")
        labels_str = ",".join(labels)

        # Format command
        cmd = container.get('Command', '')
        if not cmd.startswith('"'):
            cmd = f'"{cmd}"'

        # Format created date
        created_ts = container.get('Created')
        created_str = datetime.fromtimestamp(created_ts).strftime('%Y-%m-%d %H:%M:%S +0000 UTC')

        # Calculate "RunningFor" (e.g., "3 hours ago")
        # Docker API returns "Status": "Up 3 hours". 
        # "RunningFor" in docker ps usually means "Created X ago" or "Started X ago".
        # The old output had "RunningFor": "3 hours ago".
        # We can approximate this from Created time.
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
            "ID": container.get('Id')[:12],
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




    # STEP 4: Return the response
    json_obj['containers'] = containers
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
        '--hostname', f'server{vm_id}',
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


