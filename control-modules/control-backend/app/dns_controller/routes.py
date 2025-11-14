############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-14
# Version:          1.0
# Description:      DNS controller routes (Hosting Specific)
############################################################

from flask import Blueprint, request, Response, jsonify
from flask_login import login_required, current_user
import json
import requests
import re


from ..database.db import get_db_connection
from ..auth.user import check_user_is_allowed_to_access_vm



dns_controller_bp = Blueprint('dns_controller', __name__)






def update_caddy_config():
    # Get the domains from the database
    with get_db_connection() as conn:
        sqlFetchData = conn.execute('''
            SELECT
                json_object(
                    'domains', json_group_array(
                        json_object(
                            'id', ID,
                            'virtualserverid', VirtualServerID,
                            'domainname', DomainName,
                            'iscloudflare', IsCloudflare,
                            'ssl', SSL
                        )
                    )
                )
            FROM Hosting_DomainNames
        ''', [])
        domains = sqlFetchData.fetchone()[0]


    # Send the domains to the Docker controller
    response = requests.post(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/updatecaddyconfig', json=domains)
    response.raise_for_status()  # Raises an HTTPError for bad responses
    return json.loads(response.text)






def is_domain_valid(virtualServerID, domainname):

    # Domain name must be at least 3 characters long
    if(len(domainname) < 5):
        return False, 'Domain name must be at least 5 characters long'

    # Check if domain name is too long
    if(len(domainname) >= 40):
        return False, 'Domain name is too long'

    # Must consist at least one dot
    if(len(domainname.split('.')) <= 1):
        return False, 'Domain name must consist at least one dot'

    # Check if domain name consists of repeated dots
    if(domainname.count('..') > 0):
        return False, 'Domain name cannot consist of repeated dots'

    # Check if domain name consists of allowed characters
    if(re.match(r'^[a-zA-Z0-9-_.]+$', domainname) is None):
        return False, 'Invalid characters in domain name'

    # Check if domain starts and ends with character (a-z)
    if(not domainname[0].isalpha() or not domainname[-1].isalpha()):
        return False, 'Domain name must start and end with characters (a-z)'

    # Check if the domain is already taken
    with get_db_connection() as conn:
        sqlFetchData = conn.execute('SELECT COUNT(*) FROM Hosting_DomainNames WHERE VirtualServerID <> ? AND DomainName = ?', [virtualServerID, domainname])
        if(sqlFetchData.fetchone()[0] > 0):
            return False, 'Domain name is already taken'
        
    return True, 'Domain name is valid'








@dns_controller_bp.route('/api/vm/dns/isvalid', methods=['GET'])
@login_required
def vm_dns_isvalid_HTTPGET():
    domainname = urllib.parse.unquote(request.args.get('domainname')).lower()
    virtualServerID = request.args.get('virtualserverid')
    
    # Check if domain name is valid
    is_valid, error_message = is_domain_valid(virtualServerID, domainname)
    return jsonify({'isvalid': is_valid, 'error_message': error_message}), 200







@dns_controller_bp.route('/api/vm/dns/<int:virtualServerID>', methods=['GET', 'POST', 'PUT'])
@dns_controller_bp.route('/api/vm/dns/<int:virtualServerID>/<int:domainID>', methods=['DELETE'])
@login_required
def vm_dns_HTTPGET(virtualServerID, domainID=None):
    with get_db_connection() as conn:


        # Check if user is allowed to access specific virtual server
        if(virtualServerID is not None):
            if(check_user_is_allowed_to_access_vm(current_user, virtualServerID) == False):
                return jsonify({'message':'Unauthorized'}), 401



        # Handle GET, PUT, POST, DELETE requests
        if request.method == "GET":
            sqlFetchData = conn.execute(f'''
                SELECT
                    json_group_array(
                        json_object(
                            'id', ID,
                            'virtualserverid', VirtualServerID,
                            'domainname', DomainName,
                            'iscloudflare', IsCloudflare,
                            'ssl', SSL
                        )
                    )
                FROM 
                    Hosting_DomainNames
                WHERE 
                    VirtualServerID = ?
            ''', [virtualServerID])
            responseJson = sqlFetchData.fetchone()[0]
            return jsonify(json.loads(responseJson))
        


        elif request.method == "PUT":
            postData = request.get_json()

            # Check if domain name is valid
            is_valid, error_message = is_domain_valid(virtualServerID, postData['domainname'])
            if(is_valid == False):
                return jsonify({'message':'Error', 'reason': error_message}), 400

            # Update the domain name
            conn.execute('UPDATE Hosting_DomainNames SET DomainName = ?, IsCloudflare = ?, SSL = ? WHERE ID = ?', 
                [ postData['domainname'].lower(), postData['iscloudflare'], postData['ssl'], postData['domainid'] ])
            conn.commit()
            dockerBackendResponse = update_caddy_config()
            return jsonify({'message':'OK'}), 200



        elif request.method == "POST":
            postData = request.get_json()

            # Check if domain name is valid
            is_valid, error_message = is_domain_valid(virtualServerID, postData['domainname'])
            if(is_valid == False):
                return jsonify({'message':'Error', 'reason': error_message}), 400

            # Insert the domain name
            conn.execute('INSERT INTO Hosting_DomainNames (VirtualServerID, DomainName, IsCloudflare, SSL) VALUES (?, ?, ?, ?)', 
                [ virtualServerID, postData['domainname'].lower(), postData['iscloudflare'], postData['ssl'] ])
            conn.commit()
            dockerBackendResponse = update_caddy_config()
            return jsonify({'message':'OK'}), 200
        


        elif request.method == "DELETE":
            conn.execute('DELETE FROM Hosting_DomainNames WHERE ID = ?', [domainID])
            conn.commit()
            dockerBackendResponse = update_caddy_config()
            return jsonify({'message':'OK'}), 200
        


        else:
            return jsonify({'message':'Method not allowed'}), 405





