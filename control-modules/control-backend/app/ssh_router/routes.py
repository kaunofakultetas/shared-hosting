############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-24
# Version:          1.0
# Description:      SSH router routes (Hosting Specific)
############################################################

from flask import Blueprint, request, Response, jsonify
from flask_login import login_required, current_user
import json
import requests
import re
import urllib.parse
import os


from ..database.db import get_db_connection
from ..auth.user import check_user_is_allowed_to_access_vm


ssh_router_bp = Blueprint('ssh_router', __name__)




# Environment variables
BACKEND_SSH_API_URL = os.getenv('BACKEND_SSH_API_URL')
BACKEND_SSH_API_KEY = os.getenv('BACKEND_SSH_API_KEY')





@ssh_router_bp.route('/api/sshrouter', methods=['POST'])
def sshrouter_HTTPPOST():
    postData = request.get_json()


    # STEP 1: Validate username
    if(not 'username' in postData):
        return jsonify({'message':'Username is required'}), 400
    if(not postData['username'].startswith('server')):
        return jsonify({'message':'Username must start with "server"'}), 400


    # STEP 2: Validate API key
    if(not 'api_key' in postData):
        return jsonify({'message':'API key is required'}), 400
    if(postData['api_key'] != BACKEND_SSH_API_KEY):
        return jsonify({'message':'Invalid API key'}), 401


    # STEP 3: Validate server ID
    serverID = postData['username'].replace('server', '')
    if(not serverID.isdigit()):
        return jsonify({'message':'Server ID must be a number'}), 400
    serverID = int(serverID)


    # STEP 4: Get upstream VM data
    serverData = {}
    with get_db_connection() as conn:
        sqlfetchdata = conn.execute(f''' 
            SELECT
                json_object(
                    'password_hash', System_Users.Password,
                    'upstream_host', 'hosting-users-dind-{serverID}',
                    'upstream_port', '22',
                    'upstream_user', 'root',
                    'upstream_pass', 'root'
                )
            FROM
                Hosting_VirtualServers
            LEFT JOIN System_Users
                ON System_Users.ID = Hosting_VirtualServers.OwnerID
            WHERE Hosting_VirtualServers.ID = ?
        ''', [serverID])
        serverData = json.loads(sqlfetchdata.fetchone()[0])


    # STEP 5: Return server data
    print(json.dumps(serverData, indent=4))
    return Response(json.dumps(serverData, indent=4), mimetype='application/json')
