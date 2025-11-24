############################################################
# Author:           Tomas Vanagas
# Updated:          2025-06-29
# Version:          1.0
# Description:      App Initialization
############################################################


from flask import Flask
import random
import os
import hashlib
from datetime import datetime
from threading import Thread




APP_DEBUG = os.getenv('APP_DEBUG', 'false').lower() == "true"



def create_app():

    # Initialize database
    from .database.db_init import init_db
    init_db()

    # Initialize docker monitor
    if os.environ.get('WERKZEUG_RUN_MAIN') == 'true' or not APP_DEBUG:
        from .docker.monitor import docker_info_background_updater
        daemon = Thread(target=docker_info_background_updater, daemon=True, name='DockerInfoUpdater')
        daemon.start()


    ###### Flask App Initialization ######
    app = Flask(__name__)


    # Initialize Flask extensions
    if(APP_DEBUG):
        app.secret_key = hashlib.sha256(datetime.now().strftime("%Y-%m-%d").encode()).digest()
    else:
        app.secret_key = random.randbytes(32)
    app.config['SESSION_COOKIE_HTTPONLY'] = False


    # Initialize Flask login manager
    from .auth.user import login_manager
    login_manager.init_app(app)

    
    # Register blueprints
    from .auth.routes import auth_bp
    app.register_blueprint(auth_bp, url_prefix='')

    from .virtual_server.routes import virtual_server_bp
    app.register_blueprint(virtual_server_bp, url_prefix='')

    from .dns_controller.routes import dns_controller_bp
    app.register_blueprint(dns_controller_bp, url_prefix='')

    from .ssh_router.routes import ssh_router_bp
    app.register_blueprint(ssh_router_bp, url_prefix='')





    return app