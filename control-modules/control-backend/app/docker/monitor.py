import json
import requests
import time
from datetime import datetime
from threading import Thread
import os
from ..database.db import get_db_connection






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