import bz2
import sqlite3
import hashlib
import json
import socket
import time
import sys
import os
import ipaddress
import base64
from datetime import datetime, date, timedelta
import bcrypt
import random
import re
from functools import wraps
import requests
from threading import Thread

from decimal import Decimal
import urllib.parse


from flask import Flask, request, jsonify, make_response, Response, redirect, send_file, session
from flask_login import (LoginManager, UserMixin, current_user, login_required, login_user, logout_user)
from flask_restful import Resource, Api
from flask_cors import CORS

from werkzeug.utils import secure_filename


# from flask_socketio import SocketIO




# Flask vars
APP_DEBUG = os.getenv('APP_DEBUG', 'false').lower() == "true"
app = Flask(__name__)
cors = CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)
# socketio = SocketIO(app)
app.secret_key = b'b826fd9844c136d9da9d00670c67150b6eb37690e703a030e40ac903f13317df'







################# UTILS #################
con = sqlite3.connect('database.db', check_same_thread=False)
#con.text_factory = lambda x: unicode(x, 'utf-8', 'ignore')
cur = con.cursor()


def get_db_connection():
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    return conn


def timestamp_to_datetime_string(timestamp):
    dt_object = datetime.datetime.fromtimestamp(timestamp)
    datetime_string = dt_object.strftime('%Y-%m-%d %H:%M:%S')
    return datetime_string

#########################################












################# FLASK AUTH #################
login_manager = LoginManager()
login_manager.init_app(app)

class User(UserMixin):
    def __init__(self, id, email, password, admin, enabled):
         self.id = id
         self.email = email
         self.password = password
         self.admin = admin
         self.enabled = enabled
         self.authenticated = False

    def get_id(self):
        return str(self.id)


@login_manager.user_loader
def load_user(user_id):
    with get_db_connection() as conn:
        sqlFetchData = conn.execute(''' 
            SELECT
                ID,
                Email,
                Password,
                Admin,
                Enabled
            FROM
                System_Users
            WHERE 
                ID = ?
        ''', [user_id]).fetchall()
        
        if len(sqlFetchData) != 1:
            return None

        sqlFetchData = sqlFetchData[0]
        return User(sqlFetchData[0], sqlFetchData[1], sqlFetchData[2], sqlFetchData[3], sqlFetchData[4])


def get_user_by_email(email):
    with get_db_connection() as conn:
        sqlFetchData = conn.execute(''' 
            SELECT
                ID,
                Email,
                Password,
                Admin,
                Enabled
            FROM
                System_Users
            WHERE 
                Email = ?
        ''', [email]).fetchall()
        
        if len(sqlFetchData) != 1:
            return None

        sqlFetchData = sqlFetchData[0]
        return User(sqlFetchData[0], sqlFetchData[1], sqlFetchData[2], sqlFetchData[3], sqlFetchData[4])



def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if not current_user.admin:
            return jsonify({'message': 'Unauthorized: Admin required'}), 401
        return func(*args, **kwargs)
    return wrapper


#########################################











# +------------------------------------------------------------------------------------------------+
# +---------------------------- Background Docker Information Updater -----------------------------+
# +------------------------------------------------------------------------------------------------+
# ENV's
DOCKER_CONTROLLER_API_KEY = os.getenv('DOCKER_CONTROLLER_API_KEY')
DOCKER_CONTROLLER_HOST = os.getenv('DOCKER_CONTROLLER_HOST', 'hosting-control-docker')
DOCKER_CONTROLLER_PORT = os.getenv('DOCKER_CONTROLLER_PORT', '8000')


def push_docker_info_to_db(json_obj, parentServerID=0):
    with get_db_connection() as conn:
        timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for container in json_obj['containers']:
            containerHostname = container['Names']

            conn.execute('''
                INSERT OR IGNORE INTO Hosting_DockerContainers 
                    (DockerID, ParentServerID, Command, CreatedAt, Image, Labels, Mounts, Names, Networks, Ports, RunningFor, Size, State, Status, UpdatedAt) 
                VALUES 
                    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
                [container['ID'], parentServerID, container['Command'], container['CreatedAt'], container['Image'], 
                container['Labels'], container['Mounts'], container['Names'], container['Networks'], container['Ports'], container['RunningFor'], 
                container['Size'], container['State'], container['Status'], timeNow])


            conn.execute('''
                UPDATE Hosting_DockerContainers SET 
                    Command = ?, CreatedAt = ?, Image = ?, Labels = ?, Mounts = ?, Names = ?, Networks = ?, Ports = ?,
                    RunningFor = ?, Size = ?, State = ?, Status = ?, UpdatedAt = ?
                WHERE
                    DockerID = ? AND ParentServerID = ?
            ''', [container['Command'], container['CreatedAt'], container['Image'], container['Labels'], container['Mounts'], container['Names'], 
                container['Networks'], container['Ports'], container['RunningFor'], container['Size'], container['State'], container['Status'], timeNow, 
                container['ID'], parentServerID])

            # Delete old docker info
            conn.execute('''
                DELETE FROM Hosting_DockerContainers WHERE ParentServerID = ? AND UpdatedAt <> ?
            ''', [parentServerID, timeNow])

            # Insert and update virtual server
            if(parentServerID == 0):
                if(containerHostname.startswith('hosting-users-dind-')):
                    virtualServerID = containerHostname.replace('hosting-users-dind-', '')
                    conn.execute('''
                        INSERT OR IGNORE INTO Hosting_VirtualServers (ID, OwnerID, Name, Enabled, Deleted, CreatedAt, UpdatedAt) VALUES (?, 0, '', 1, 0, ?, ?)
                    ''', [virtualServerID, timeNow, timeNow])
                    conn.execute(''' UPDATE Hosting_VirtualServers SET UpdatedAt = ? WHERE ID = ? ''', [timeNow, virtualServerID])

            conn.commit()






def docker_info_background_updater():
    while True:
        time.sleep(3)

        # Update host docker info
        try:
            json_obj = json.loads(requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/status/host').text)
            push_docker_info_to_db(json_obj, parentServerID=0)
        


            # Update users docker info
            virtualServerHostnames = []
            with get_db_connection() as conn:
                virtualServerHostnames = conn.execute(''' 
                    SELECT Names FROM Hosting_DockerContainers 
                    WHERE ParentServerID = 0 AND Names LIKE "hosting-users-dind-%" AND State = "running"
                ''').fetchall()


            for virtualServerHostname in virtualServerHostnames:
                try:
                    virtualServerHostname = virtualServerHostname[0]
                    json_obj = json.loads(requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/status/{virtualServerHostname}').text)
                    push_docker_info_to_db(json_obj, parentServerID=virtualServerHostname.replace('hosting-users-dind-', ''))
                except Exception as e:
                    print(f'Docker Info Updater Error: {e}, container: {virtualServerHostname}')
        
        
        except Exception as e:
            print(f'Docker Info Updater Error: {e}')


if __name__ == '__main__':
    daemon = Thread(target=docker_info_background_updater, daemon=True, name='DockerInfoUpdater')
    daemon.start()

# +------------------------------------------------------------------------------------------------+
# +------------------------------------------------------------------------------------------------+
# +------------------------------------------------------------------------------------------------+








@app.route('/api/login', methods=['POST'])
def login_HTTPPOST():
    postData = request.get_json()

    # Preauth Checks
    if( not postData or (not postData.get('email') and not postData.get('password')) ):
        return "Įveskite El. Pašto adresą ir Slaptažodį."

    if( not postData.get('email') ):
        return "Įveskite El. Pašto adresą."

    if( not postData.get('password') ):
        return "Įveskite Slaptažodį."
    

    # Remove trailing and leading spaces from email and password
    postData['email'] = postData['email'].strip()
    postData['password'] = postData['password'].strip()


    # Authentication
    thisUserObject = get_user_by_email(postData['email'].lower())
    if(thisUserObject is not None):

        # Login Check
        if( bcrypt.checkpw( str.encode(postData.get('password')), str.encode(thisUserObject.password) )):
            login_user(thisUserObject)
            return 'OK'
        else:
            # Dummy check
            bcrypt.checkpw( str.encode("This Only Used to prevent time based user enumeration attack, so doing nothing there."), 
                            str.encode('$2b$12$37rvWwtdP/sb.pZwBklPFeUxoH.KWOXIDjTxiiC9awCYpXIB8EbmS') )
        return "El. Paštas ir/arba Slaptažodis neteisingas."
    
    else:
        # Dummy check
        bcrypt.checkpw( str.encode("This Only Used to prevent time based user enumeration attack, so doing nothing there."), 
                        str.encode('$2b$12$37rvWwtdP/sb.pZwBklPFeUxoH.KWOXIDjTxiiC9awCYpXIB8EbmS') )
        return "El. Paštas ir/arba Slaptažodis neteisingas."






@app.route('/api/admin/users', methods=['GET', 'POST'])
@login_required
@admin_required
def usersList_HTTP():
    with get_db_connection() as conn:
        if request.method == "GET":
            sqlFetchData = conn.execute(f'''
                WITH GetUserServersCount AS (
                    SELECT
                        OwnerID,
                        COUNT(*) AS ServerCount
                    FROM
                        Hosting_VirtualServers
                    WHERE
                        Deleted = 0
                    GROUP BY OwnerID
                )
                SELECT
                    json_group_array(
                        json_object(
                            'id',           System_Users.ID,
                            'email',        System_Users.Email,
                            'servercount',  IFNULL(GetUserServersCount.ServerCount, 0),
                            'admin',        System_Users.Admin,
                            'enabled',      System_Users.Enabled,
                            'lastseen',     System_Users.LastLogin
                        )
                    ) AS UsersJSON
                FROM
                    System_Users
                LEFT JOIN GetUserServersCount
                    ON GetUserServersCount.OwnerID = System_Users.ID
            ''')
            return Response(json.dumps(json.loads(sqlFetchData.fetchone()[0]), indent=4), mimetype='application/json')
        elif request.method == "POST":
            postData = request.get_json()

            if(postData['action'] == 'insertupdate'):
                passwordHash = bcrypt.hashpw(postData['password'].strip().encode('utf-8'), bcrypt.gensalt(rounds=12)).decode("utf-8")

                if(postData['id'] == ''):
                    if(len(postData['password']) == 0):
                        return Response(json.dumps({'type': 'error', 'reason': 'Password must be at least 8 characters long'}), mimetype='application/json')
                    conn.execute(' INSERT OR IGNORE INTO System_Users (Email, Password, Admin, Enabled) VALUES (?,?,?,?) ',
                                    [ postData['email'].lower().strip(), passwordHash, postData['admin'], postData['enabled'] ])
                else:    
                    if(len(postData['password']) != 0):
                        conn.execute(' UPDATE System_Users SET Password = ? WHERE ID = ? ', [ passwordHash,                         postData['id'] ])
                    conn.execute(' UPDATE System_Users SET Email = ? WHERE ID = ? ',        [ postData['email'].lower().strip(),    postData['id'] ])
                    conn.execute(' UPDATE System_Users SET Admin = ? WHERE ID = ? ',        [ postData['admin'],                    postData['id'] ])
                    conn.execute(' UPDATE System_Users SET Enabled = ? WHERE ID = ? ',      [ postData['enabled'],                  postData['id'] ])
                
                conn.commit()
                return Response(json.dumps({'type': 'ok'}), mimetype='application/json')
            

            elif(postData['action'] == 'delete'):
                conn.execute(' DELETE FROM System_Users WHERE ID = ? ', [ postData['id'] ])
                conn.commit()
                return Response(json.dumps({'type': 'ok'}), mimetype='application/json')
            return Response(json.dumps({'type': 'error'}), mimetype='application/json')






def check_user_is_allowed_to_access_vm(current_user, virtualServerID):
    with get_db_connection() as conn:

        # If virtual server ID is not provided, return False
        if(virtualServerID is None):
            return False
        
        # If user is admin, return True
        if(getattr(current_user, 'admin', 0) == 1):
            return True
        
        # Check if user is owner of this virtual server
        ownerID = conn.execute('SELECT OwnerID FROM Hosting_VirtualServers WHERE ID = ?', [virtualServerID]).fetchone()
        if(ownerID is not None):
            ownerID = ownerID[0]
            if(ownerID == current_user.id):
                return True

        return False
                    






@app.route('/api/checkauth/vm/<int:virtualServerID>', methods=['GET'])
@app.route('/api/checkauth', methods=['GET'])
@login_required
def checkauth_HTTPGET(virtualServerID=None):
    with get_db_connection() as conn:

        # Check if user is enabled
        enabled = conn.execute('SELECT Enabled FROM System_Users WHERE ID = ?', [current_user.id]).fetchone()[0]
        if(enabled == 0):
            return jsonify({'message':'Unauthorized'}), 401


        # Check if user is allowed to access this virtual server
        if(virtualServerID is not None):
            if(check_user_is_allowed_to_access_vm(current_user, virtualServerID) == False):
                return jsonify({'message':'Unauthorized'}), 401


        # User Info
        user_info = {
            "id": current_user.id,
            "email": current_user.email,
            "admin": getattr(current_user, 'admin', 0)
        }


        # Update LastLogin
        timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute('UPDATE System_Users SET LastLogin = ? WHERE ID = ?', [timeNow, current_user.id])
        return Response(json.dumps(user_info, indent=4), mimetype='application/json')







@app.route('/api/checkauth/admin', methods=['GET'])
@login_required
@admin_required
def checkauth_admin_HTTPGET():
    with get_db_connection() as conn:

        # User Info
        user_info = {
            "id": current_user.id,
            "email": current_user.email,
            "admin": getattr(current_user, 'admin', 0)
        }

        # Update LastLogin
        timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute('UPDATE System_Users SET LastLogin = ? WHERE ID = ?', [timeNow, current_user.id])
        return Response(json.dumps(user_info, indent=4), mimetype='application/json')









@app.route('/api/admin/home', methods=['GET'])
@login_required
@admin_required
def homePage_HTTPGET():
    with get_db_connection() as conn:
        timeNow_minus30min = (datetime.now() - timedelta(hours=0, minutes=30)).strftime("%Y-%m-%d %H:%M:%S")

        sqlFetchData = conn.execute(f'''
            SELECT 
                json_object(
                    'studentscount',            0,
                    'enabledquestionscount',    0,
                    'totalquestionscount',      0,
                    'studentsprogress',         0
                )
        ''', [])
        responseJson = sqlFetchData.fetchone()[0]
        responseJson = json.dumps(json.loads(responseJson), indent=4)
        return Response(responseJson, mimetype='application/json')






@app.route('/api/vm/<int:virtualServerID>', methods=['GET'])
@app.route('/api/vm', methods=['GET'])
@login_required
def vm_HTTPGET(virtualServerID=None):

    # Check if user is allowed to access specific virtual server
    if(virtualServerID is not None):    
        if(check_user_is_allowed_to_access_vm(current_user, virtualServerID) == False):
            return jsonify({'message':'Unauthorized'}), 401


    with get_db_connection() as conn:
        sqlFetchData = conn.execute(f'''
            WITH GetVirtualServers AS (
                SELECT
                    REPLACE(Hosting_DockerContainers.Names, 'hosting-users-dind-', '') AS VirtualServerID,
                    Hosting_VirtualServers.OwnerID,
                    System_Users.Email AS OwnerEmail,
                    Hosting_VirtualServers.Name,
                    Hosting_DockerContainers.Status,
                    Hosting_DockerContainers.State,
                    Hosting_VirtualServers.Enabled
                FROM
                    Hosting_DockerContainers
                LEFT JOIN Hosting_VirtualServers
                    ON Hosting_VirtualServers.ID = VirtualServerID
                LEFT JOIN System_Users
                    ON System_Users.ID = Hosting_VirtualServers.OwnerID
                WHERE
                    --Hosting_DockerContainers.Image  = 'hosting-users-dind'
                    Hosting_DockerContainers.ParentServerID = 0
                    AND Hosting_VirtualServers.Deleted = 0
                GROUP BY VirtualServerID
            ),
            GetVirtualServersDockers AS (
                SELECT
					TRIM(
						SUBSTR(
							Labels, 
							INSTR(Labels, 'com.docker.compose.project=') + LENGTH('com.docker.compose.project='),
							CASE 
								WHEN INSTR(SUBSTR(Labels, INSTR(Labels, 'com.docker.compose.project=') + LENGTH('com.docker.compose.project=')), ',') = 0 
								THEN LENGTH(Labels)
								ELSE INSTR(SUBSTR(Labels, INSTR(Labels, 'com.docker.compose.project=') + LENGTH('com.docker.compose.project=')), ',') - 1
							END
						)
					) AS StackName,
                    ParentServerID,
                    Image,
                    Names,
                    RunningFor,
                    State,
                    Status
                FROM
                    Hosting_DockerContainers
                WHERE
                    Hosting_DockerContainers.ParentServerID <> 0
            ),
            GetAllStacks AS (
                SELECT
                    ParentServerID,
                    StackName,
                    json_object(
                        'stackname', StackName,
                        'containers',			json_group_array(
                            json_object(
                                'image',        Image,
                                'names',        Names,
                                'runningfor',	RunningFor,
                                'state',		State,
                                'status',		Status
                            )
                        )
                    ) AS StacksJSON
                FROM GetVirtualServersDockers
                GROUP BY ParentServerID, StackName
            ),
			GetVirtualServersStacks AS (
				SELECT
					ParentServerID,
					StackName,
					json_group_array(JSON(StacksJSON)) AS StacksJSON
				FROM
					GetAllStacks
				GROUP BY ParentServerID
			)



            SELECT
				json_group_array(
					json_object(
						'id', 						VirtualServerID,
						'name',						Name,
						'status',					Status,
						'state',					State,
						'enabled',					Enabled,
                        'owneremail',				OwnerEmail,
						'stacks',					JSON(GetVirtualServersStacks.StacksJSON)
					)
				)
            FROM GetVirtualServers
			LEFT JOIN GetVirtualServersStacks
				ON GetVirtualServersStacks.ParentServerID = GetVirtualServers.VirtualServerID
            WHERE
                {f"GetVirtualServers.VirtualServerID = '{virtualServerID}'" 
                    if virtualServerID is not None else 
                f"GetVirtualServers.OwnerID = '{current_user.id}'"}
        ''', [])
        responseJson = sqlFetchData.fetchone()[0]
        responseJson = json.dumps(json.loads(responseJson), indent=4)
        return Response(responseJson, mimetype='application/json')






#########################################################
###################  DNS Controller  ####################
#########################################################

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






@app.route('/api/vm/dns/isvalid', methods=['GET'])
@login_required
def vm_dns_isvalid_HTTPGET():
    domainname = urllib.parse.unquote(request.args.get('domainname')).lower()
    virtualServerID = request.args.get('virtualserverid')
    
    # Check if domain name is valid
    is_valid, error_message = is_domain_valid(virtualServerID, domainname)
    return jsonify({'isvalid': is_valid, 'error_message': error_message}), 200







@app.route('/api/vm/dns/<int:virtualServerID>', methods=['GET', 'POST', 'PUT'])
@app.route('/api/vm/dns/<int:virtualServerID>/<int:domainID>', methods=['DELETE'])
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

#########################################################
#########################################################
#########################################################








@app.route('/api/vm/control', methods=['POST'])
@login_required
def vmControl_HTTPPOST():
    postData = request.get_json()


    virtualServerID = postData.get('virtualServerID')
    if(virtualServerID is not None):
        containerName = 'hosting-users-dind-' + virtualServerID
    action = postData.get('action')



    with get_db_connection() as conn:

        if(action != 'create'):
            # Check if user is owner of this virtual server
            if(getattr(current_user, 'admin', 0) == 0):
                ownerID = conn.execute('SELECT OwnerID FROM Hosting_VirtualServers WHERE ID = ?', [virtualServerID]).fetchone()[0]
                if(ownerID != current_user.id):
                    return jsonify({'message':'Unauthorized'}), 401


   
            if(action == 'start'):
                conn.execute('UPDATE Hosting_VirtualServers SET Enabled = 1 WHERE ID = ?', [virtualServerID])
                conn.commit()
                requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/start/{containerName}')
                return jsonify({'message':'OK'}), 200

            elif(action == 'stop'):
                conn.execute('UPDATE Hosting_VirtualServers SET Enabled = 0 WHERE ID = ?', [virtualServerID])
                conn.commit()
                requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/stop/{containerName}')
                return jsonify({'message':'OK'}), 200
            
            elif(action == 'delete'):
                conn.execute('UPDATE Hosting_VirtualServers SET Deleted = 1 WHERE ID = ?', [virtualServerID])
                conn.execute('DELETE FROM Hosting_DockerContainers WHERE ParentServerID = ?', [virtualServerID])
                conn.execute('DELETE FROM Hosting_DomainNames WHERE VirtualServerID = ?', [virtualServerID])
                conn.commit()
                requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/delete/{containerName}')
                return jsonify({'message':'OK'}), 200


        else:
            timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            serverName = postData.get('name')
            sqlfetchdata = conn.execute('INSERT INTO Hosting_VirtualServers (OwnerID, Name, Enabled, Deleted, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)', [current_user.id, serverName, 1, 0, timeNow, timeNow])
            virtualServerID = sqlfetchdata.lastrowid
            conn.commit()

            containerName = 'hosting-users-dind-' + str(virtualServerID)
            
            with requests.Session() as session:
                try:
                    session.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/create/{containerName}', timeout=1)
                except requests.exceptions.ReadTimeout:
                    pass

            return jsonify({'message':'OK'}), 200





if __name__ == '__main__':


    if(len(sys.argv) == 1):
        print("Empty")


    elif(sys.argv[1] == "--http"):
        app.run(host='0.0.0.0', port=8000, debug=APP_DEBUG)


