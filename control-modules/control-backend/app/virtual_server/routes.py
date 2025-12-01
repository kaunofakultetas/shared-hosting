############################################################
# Author:           Tomas Vanagas
# Updated:          2025-07-27
# Version:          1.0
# Description:      Virtual server control 
#                   routes (Hosting Specific)
############################################################


from flask import Blueprint, request, Response, jsonify
from flask_login import login_user, login_required, current_user
import bcrypt
import json
from datetime import datetime
import random
import re
import requests
import os

from ..auth.user import load_user, admin_required, check_user_is_allowed_to_access_vm
from ..database.db import get_db_connection



# Flask Blueprint
virtual_server_bp = Blueprint('virtual_server', __name__)



# Environment variables
DOCKER_CONTROLLER_HOST = os.getenv('DOCKER_CONTROLLER_HOST')
DOCKER_CONTROLLER_PORT = os.getenv('DOCKER_CONTROLLER_PORT')





@virtual_server_bp.route('/api/vm/<int:virtualServerID>', methods=['GET'])
@virtual_server_bp.route('/api/vm', methods=['GET'])
@login_required
def vm_HTTPGET(virtualServerID=None):

    showOtherUsersVMs = request.args.get('showOtherUsers', 'false').lower() == 'true'
    if current_user.admin == 0 and showOtherUsersVMs:
        return jsonify({'message':'Unauthorized'}), 401

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
			),
            GetVirtualServersDomains AS (
                SELECT
                    VirtualServerID,
                    json_group_array(
                        json_object(
                            'id', ID,
                            'domainname', DomainName,
                            'iscloudflare', IsCloudflare,
                            'ssl', SSL
                        )
                    ) AS DomainsJSON
                FROM
                    Hosting_DomainNames
                GROUP BY VirtualServerID
            )



            SELECT
				json_group_array(
					json_object(
						'id', 						GetVirtualServers.VirtualServerID,
						'name',						Name,
						'status',					Status,
						'state',					State,
						'enabled',					Enabled,
                        'owneremail',				OwnerEmail,
						'stacks',					JSON(GetVirtualServersStacks.StacksJSON),
                        'domains',					JSON(GetVirtualServersDomains.DomainsJSON)
					)
				)
            FROM GetVirtualServers
			LEFT JOIN GetVirtualServersStacks
				ON GetVirtualServersStacks.ParentServerID = GetVirtualServers.VirtualServerID
            LEFT JOIN GetVirtualServersDomains
                ON GetVirtualServersDomains.VirtualServerID = GetVirtualServers.VirtualServerID
            WHERE
                1=1

                -- If virtual server ID is provided, filter by virtual server ID
                {f"AND GetVirtualServers.VirtualServerID = '{virtualServerID}'" if virtualServerID is not None else ''}

                -- If user does not want to see all virtual servers, filter by user ID
                {f"AND GetVirtualServers.OwnerID = '{current_user.id}'" if showOtherUsersVMs == False and virtualServerID is None else ''}

        ''', [])
        responseJson = sqlFetchData.fetchone()[0]
        responseJson = json.dumps(json.loads(responseJson), indent=4)
        return Response(responseJson, mimetype='application/json')








@virtual_server_bp.route('/api/vm/control', methods=['POST'])
@login_required
def vmControl_HTTPPOST():
    postData = request.get_json()
    timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


    virtualServerID = postData.get('virtualServerID')
    if(virtualServerID is not None):
        containerName = 'hosting-users-dind-' + virtualServerID
    action = postData.get('action')



    with get_db_connection() as conn:


        # --- CREATE ---
        if(action == 'create'):
            # Create virtual server in the database
            timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            serverName = postData.get('name')
            sqlfetchdata = conn.execute('INSERT INTO Hosting_VirtualServers (OwnerID, Name, Enabled, Deleted, CreatedAt, UpdatedAt) VALUES (?, ?, ?, ?, ?, ?)', [current_user.id, serverName, 1, 0, timeNow, timeNow])
            virtualServerID = sqlfetchdata.lastrowid


            # Create virtual server physically using the docker controller
            containerName = 'hosting-users-dind-' + str(virtualServerID)
            resp = requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/create/{containerName}', timeout=1)
            if(resp.status_code != 200):
                return jsonify({'message':'Failed to create virtual server'}), 500


            # Update database
            conn.execute('UPDATE Hosting_VirtualServers SET Enabled = 1 WHERE ID = ?', [virtualServerID])
            conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                [ 
                    current_user.id, 
                    f'Virtual server #{virtualServerID} created', 
                    timeNow 
                ]
            )
            conn.commit()

            # Return success
            return jsonify({'message':'OK'}), 200



        # ------ OTHER ACTIONS REQUIRE OWNERSHIP CHECK ------
        # Check if user is owner of this virtual server
        if(getattr(current_user, 'admin', 0) == 0):
            ownerID = conn.execute('SELECT OwnerID FROM Hosting_VirtualServers WHERE ID = ?', [virtualServerID]).fetchone()[0]
            if(ownerID != current_user.id):
                return jsonify({'message':'Unauthorized'}), 401



        # --- START ---
        if(action == 'start'):
            resp = requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/start/{containerName}')
            if(resp.status_code != 200):
                return jsonify({'message':'Failed to start virtual server'}), 500
            
            # Update database
            conn.execute('UPDATE Hosting_VirtualServers SET Enabled = 1 WHERE ID = ?', [virtualServerID])
            conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                [ 
                    current_user.id, 
                    f'Virtual server #{virtualServerID} started', 
                    timeNow 
                ]
            )
            conn.commit()

            # Return success
            return jsonify({'message':'OK'}), 200



        # --- STOP ---
        elif(action == 'stop'):
            resp = requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/stop/{containerName}')
            if(resp.status_code != 200):
                return jsonify({'message':'Failed to stop virtual server'}), 500

            # Update database
            conn.execute('UPDATE Hosting_VirtualServers SET Enabled = 0 WHERE ID = ?', [virtualServerID])
            conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                [ 
                    current_user.id, 
                    f'Virtual server #{virtualServerID} stopped', 
                    timeNow 
                ]
            )
            conn.commit()

            # Return success
            return jsonify({'message':'OK'}), 200



        # --- DELETE ---
        elif(action == 'delete'):
            resp = requests.get(f'http://{DOCKER_CONTROLLER_HOST}:{DOCKER_CONTROLLER_PORT}/api/delete/{containerName}')
            if(resp.status_code != 200):
                return jsonify({'message':'Failed to delete virtual server'}), 500
            
            # Update database
            conn.execute('UPDATE Hosting_VirtualServers SET Deleted = 1 WHERE ID = ?', [virtualServerID])
            conn.execute('DELETE FROM Hosting_DockerContainers WHERE ParentServerID = ?', [virtualServerID])
            conn.execute('DELETE FROM Hosting_DomainNames WHERE VirtualServerID = ?', [virtualServerID])
            conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                [ 
                    current_user.id, 
                    f'Virtual server #{virtualServerID} deleted', 
                    timeNow 
                ]
            )
            conn.commit()

            # Return success
            return jsonify({'message':'OK'}), 200

        
        # --- RENAME ---
        elif(action == 'rename'):
            
            # Validation
            if(not 'newName' in postData):
                return jsonify({'message':'New name is required'}), 400
            if(len(postData.get('newName')) < 3):
                return jsonify({'message':'New name must be at least 3 characters long'}), 400
            if(len(postData.get('newName')) > 30):
                return jsonify({'message':'New name must be less than 30 characters long'}), 400
            if(re.match(r'^[a-zA-Z0-9-_. ]+$', postData.get('newName')) is None):
                return jsonify({'message':'New name can only contain letters, numbers, spaces, and hyphens'}), 400

            # Update database
            newName = postData.get('newName')
            conn.execute('UPDATE Hosting_VirtualServers SET Name = ? WHERE ID = ?', [newName, virtualServerID])
            conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                [ 
                    current_user.id, 
                    f'Virtual server #{virtualServerID} renamed to "{newName}"', 
                    timeNow 
                ]
            )
            conn.commit()

            # Return success
            return jsonify({'message':'OK'}), 200


        # --- INVALID ---
        else:
            return jsonify({'message':'Invalid action'}), 400




