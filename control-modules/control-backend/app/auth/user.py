############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-14
# Version:          1.0
# Description:      User model (Hosting Specific)
############################################################


from flask import jsonify
from flask_login import UserMixin, LoginManager, current_user
from functools import wraps
from ..database.db import get_db_connection


login_manager = LoginManager()


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
        if 'admin' not in current_user.__dict__:
            return jsonify({'message': 'Unauthorized: Admin required'}), 401
        if not current_user.admin:
            return jsonify({'message': 'Unauthorized: Admin required'}), 401
        return func(*args, **kwargs)
    return wrapper




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