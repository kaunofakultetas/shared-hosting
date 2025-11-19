############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-14
# Version:          1.0
# Description:      Database initialization (Hosting Specific)
############################################################


from .db import get_db_connection





def init_db():
    init_db_tables()
    init_default_admin_user()




def init_db_tables():
    with get_db_connection() as conn:

        ############################ Users tables ###########################
        conn.execute('''
            CREATE TABLE IF NOT EXISTS "System_Users" (
                "ID"	INTEGER NOT NULL UNIQUE,
                "Email"	TEXT NOT NULL UNIQUE,
                "Password"	TEXT NOT NULL,
                "Admin"	INTEGER DEFAULT 0,
                "Enabled"	INTEGER NOT NULL DEFAULT 0,
                "LastLogin"	TEXT NOT NULL DEFAULT '',
                PRIMARY KEY("ID" AUTOINCREMENT)
            );
        ''')
        #####################################################################




        ####################### Virtual servers tables ######################
        conn.execute('''
            CREATE TABLE IF NOT EXISTS "Hosting_VirtualServers" (
                "ID"	INTEGER NOT NULL UNIQUE,
                "OwnerID"	INTEGER NOT NULL,
                "Name"	TEXT NOT NULL DEFAULT '',
                "Enabled"	INTEGER NOT NULL DEFAULT 1,
                "Deleted"	INTEGER NOT NULL DEFAULT 0,
                "CreatedAt"	TEXT NOT NULL,
                "UpdatedAt"	TEXT NOT NULL,
                PRIMARY KEY("ID")
            );
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS "Hosting_DockerContainers" (
                "DockerID"	TEXT NOT NULL,
                "ParentServerID"	INTEGER NOT NULL,
                "Command"	TEXT NOT NULL,
                "CreatedAt"	TEXT NOT NULL,
                "Image"	TEXT NOT NULL,
                "Labels"	TEXT NOT NULL,
                "Mounts"	TEXT NOT NULL,
                "Names"	TEXT NOT NULL,
                "Networks"	TEXT NOT NULL,
                "Ports"	TEXT NOT NULL,
                "RunningFor"	TEXT NOT NULL,
                "Size"	TEXT NOT NULL,
                "State"	TEXT NOT NULL,
                "Status"	TEXT NOT NULL,
                "UpdatedAt"	TEXT NOT NULL,
                UNIQUE("DockerID","ParentServerID")
            );
        ''')
        #####################################################################




        ######################### Domain names tables #######################
        conn.execute('''
            CREATE TABLE IF NOT EXISTS "Hosting_DomainNames" (
                "ID"	INTEGER NOT NULL UNIQUE,
                "VirtualServerID"	INTEGER NOT NULL,
                "DomainName"	TEXT NOT NULL UNIQUE,
                "IsCloudflare"	INTEGER NOT NULL DEFAULT 0, "SSL" INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY("ID" AUTOINCREMENT)
            );
        ''')
        #####################################################################





def init_default_admin_user():
    with get_db_connection() as conn:
        
        if(conn.execute(' SELECT COUNT(*) FROM System_Users ').fetchone()[0] == 0):
            # Default Email:       admin@admin.com
            # Default Password:    admin
            conn.execute(''' INSERT INTO System_Users (Email, Password, Admin, Enabled, LastLogin) VALUES (?,?,?,?,?) ''', 
                ['admin@admin.com', '$2a$12$4a3b6u7a1oBdtvuTkvw9TevgCwH36raEE2oe1BI9Wtt7.L4Pfb4YW', 1, 1, ''])
            conn.commit()
