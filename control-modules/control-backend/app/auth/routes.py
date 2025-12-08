############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-14
# Version:          1.0
# Description:      Authentication and user 
#                   management routes (Hosting Specific)
############################################################


from flask import Blueprint, request, Response, jsonify
from flask_login import login_user, login_required, current_user
import bcrypt
import json
from datetime import datetime, timedelta
import random
import string
import re

from .user import load_user, admin_required, get_user_by_email, check_user_is_allowed_to_access_vm
from ..database.db import get_db_connection




auth_bp = Blueprint('auth', __name__)





@auth_bp.route('/api/login', methods=['POST'])
def login_HTTPPOST():
    postData = request.get_json()
    timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

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
            with get_db_connection() as conn:
                conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
                    [ 
                        thisUserObject.id, 
                        f'User {thisUserObject.email} logged in (IP: {request.headers.get("X-Forwarded-For")})', 
                        timeNow 
                    ]
                )
                conn.commit()
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





@auth_bp.route('/api/admin/users', methods=['GET', 'POST'])
@login_required
@admin_required
def usersList_HTTP():
    with get_db_connection() as conn:

        # --- GET ---
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


        # --- POST ---
        elif request.method == "POST":
            postData = request.get_json()

            # --- INSERT/UPDATE ---
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
            

            # --- DELETE ---
            elif(postData['action'] == 'delete'):
                # Check if user has any virtual servers
                sqlFetchData = conn.execute('SELECT ID FROM Hosting_VirtualServers WHERE OwnerID = ? AND Deleted = 0', [postData['id']]).fetchone()
                if sqlFetchData is not None:
                    return Response(json.dumps({'type': 'error', 'reason': 'User has virtual servers'}), mimetype='application/json')

                # Delete user
                conn.execute(' DELETE FROM System_Users WHERE ID = ? ', [ postData['id'] ])
                conn.commit()
                return Response(json.dumps({'type': 'ok'}), mimetype='application/json')
            
            
            # --- ILLEGAL ACTION ---
            else:
                return Response(json.dumps({'type': 'error', 'reason': 'Illegal action'}), mimetype='application/json')


            return Response(json.dumps({'type': 'error'}), mimetype='application/json')





@auth_bp.route('/api/checkauth/vm/<int:virtualServerID>', methods=['GET'])
@auth_bp.route('/api/checkauth', methods=['GET'])
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






@auth_bp.route('/api/checkauth/admin', methods=['GET'])
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




@auth_bp.route('/api/account/change-password', methods=['POST'])
@login_required
def account_change_password_HTTPPOST():
    postData = request.get_json()
    timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")


    # Validation
    if not postData or not postData.get('currentPassword'):
        return jsonify({'message': 'Current password is required'}), 400
    
    if not postData.get('newPassword'):
        return jsonify({'message': 'New password is required'}), 400
    
    if len(postData.get('newPassword')) < 8:
        return jsonify({'message': 'New password must be at least 8 characters'}), 400



    # Verify current password
    with get_db_connection() as conn:
        sqlFetchData = conn.execute('SELECT Password FROM System_Users WHERE ID = ?', [current_user.id]).fetchone()
        
        if sqlFetchData is None:
            return jsonify({'message': 'User not found'}), 404
        
        storedPasswordHash = sqlFetchData[0]
        
        # Check if current password is correct
        if not bcrypt.checkpw(postData['currentPassword'].encode('utf-8'), storedPasswordHash.encode('utf-8')):
            return jsonify({'message': 'Current password is incorrect'}), 401

        # Hash new password and update
        newPasswordHash = bcrypt.hashpw(postData['newPassword'].encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        conn.execute('UPDATE System_Users SET Password = ? WHERE ID = ?', [newPasswordHash, current_user.id])
        
        # Log activity
        conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
            [current_user.id, f'User {current_user.email} changed their password', timeNow])
        
        conn.commit()



    # Return Success
    return jsonify({'message': 'Password changed successfully'}), 200





@auth_bp.route('/api/account/registration-code', methods=['GET', 'POST', 'DELETE'])
@login_required
@admin_required
def registration_code_HTTP():

    # --- GET ---
    if request.method == 'GET':
        with get_db_connection() as conn:
            
            # Delete expired registration codes
            timestampNow = int(datetime.now().timestamp())
            conn.execute('DELETE FROM System_RegistrationCodes WHERE ValidUntil < ?', [timestampNow])
            conn.commit()

            # Fetch registration code
            sqlFetchData = conn.execute('SELECT Code, ValidUntil FROM System_RegistrationCodes WHERE UserID = ?', 
                [current_user.id]).fetchone()
            if sqlFetchData is None:
                return jsonify({'message': 'No registration code found'}), 404
            return jsonify({'message': 'Registration code found', 'code': sqlFetchData[0], 'validUntil': sqlFetchData[1]}), 200


    # --- CREATE ---
    elif request.method == 'POST':
        timestampNow_plus30mins = int((datetime.now() + timedelta(minutes=30)).timestamp())
        registrationCode = ''.join(random.choices(string.ascii_letters + string.digits, k=8)).upper()

        with get_db_connection() as conn:
            conn.execute('INSERT OR REPLACE INTO System_RegistrationCodes (UserID, Code, ValidUntil) VALUES (?, ?, ?)', 
                [current_user.id, registrationCode, timestampNow_plus30mins])
            conn.commit()

        return jsonify({'message': 'Registration code created successfully', 'code': registrationCode, 'validUntil': timestampNow_plus30mins}), 200


    # --- DELETE ---
    elif request.method == 'DELETE':
        with get_db_connection() as conn:
            conn.execute('DELETE FROM System_RegistrationCodes WHERE UserID = ?', [current_user.id])
            conn.commit()

        return jsonify({'message': 'Registration code deleted successfully'}), 200





@auth_bp.route('/api/register', methods=['POST'])
def register_HTTPPOST():
    postData = request.get_json()
    timeNow = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    timestampNow = int(datetime.now().timestamp())

    # Validate input
    if not postData:
        return jsonify({'message': 'No data provided'}), 400
    if not postData.get('registrationCode'):
        return jsonify({'message': 'Registration code is required'}), 400
    if not postData.get('email'):
        return jsonify({'message': 'Email is required'}), 400
    if not postData.get('password'):
        return jsonify({'message': 'Password is required'}), 400
    if len(postData.get('password')) < 6:
        return jsonify({'message': 'Password must be at least 6 characters'}), 400


    # Validate email format
    email = postData['email'].strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return jsonify({'message': 'Invalid email format'}), 400


    # Store registration code in the variable
    registrationCode = postData['registrationCode'].strip().upper()



    with get_db_connection() as conn:

        # Check if registration code exists and is valid
        sqlFetchData = conn.execute('SELECT UserID FROM System_RegistrationCodes WHERE Code = ? AND ValidUntil > ?', 
            [registrationCode, timestampNow]
        ).fetchone()
        if sqlFetchData is None:
            return jsonify({'message': 'Invalid registration code'}), 400
        adminUserId = sqlFetchData[0]
        

        # Check if email already exists
        sqlFetchData = conn.execute('SELECT ID FROM System_Users WHERE Email = ?', [email]).fetchone()
        if sqlFetchData is not None:
            return jsonify({'message': 'Email already exists'}), 400


        # Create new user (Enabled by default since they have a valid registration code)
        passwordHash = bcrypt.hashpw(postData['password'].encode('utf-8'), bcrypt.gensalt(rounds=12)).decode('utf-8')
        conn.execute('INSERT INTO System_Users (Email, Password, Admin, Enabled, LastLogin) VALUES (?, ?, ?, ?, ?)',
            [email, passwordHash, 0, 1, '']
        )


        # Log activity
        conn.execute('INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
            [adminUserId, f'New user registered: {email}', timeNow]
        )

        conn.commit()

    return jsonify({'message': 'Registration successful! You can now login.'}), 201
