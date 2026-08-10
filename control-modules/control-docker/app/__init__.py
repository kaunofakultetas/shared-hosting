############################################################
#  [*] app — the docker controller's Flask factory
#
#  The ONLY container that touches /var/run/docker.sock. It
#  runs the physical side of every VM operation, serves the
#  container listings the backend's monitor caches, measures
#  per-VM disk usage and regenerates the users Caddyfile.
#
#  Package layout (one blueprint per domain, like the old
#  backend's app/ package):
#
#    status/routes.py           — /api/test, /api/status/<name>
#    virtual_servers/routes.py  — create/start/stop/delete/cleanup
#    usage/routes.py            — /api/usage/disk
#    caddy/routes.py            — /api/updatecaddyconfig
#    caddy/caddyfile_updater.py — the users-Caddyfile renderer
#
#  Trust model: NO authentication and state-changing GETs —
#  the isolated-control-docker network is the only caller
#  path, and only the backend lives on it. Every
#  <container_name> is guarded by ^[a-z0-9-]{1,25}$.
#
#  Used by:
#    - main.py — the --http entry point
############################################################


from flask import Flask








############################################################
# create_app
############################################################
#
# Build the Flask app and register the four blueprints. No
# secret key and no CORS layer on purpose: the service has
# no sessions, no cookies and no browser callers — the only
# clients are backend containers on the internal network.
#
# Used by:
#   - main.py — once, at startup
############################################################

def create_app():

    app = Flask(__name__)


    # Register blueprints
    from .status.routes import status_bp
    app.register_blueprint(status_bp, url_prefix='')

    from .virtual_servers.routes import virtual_servers_bp
    app.register_blueprint(virtual_servers_bp, url_prefix='')

    from .usage.routes import usage_bp
    app.register_blueprint(usage_bp, url_prefix='')

    from .caddy.routes import caddy_bp
    app.register_blueprint(caddy_bp, url_prefix='')


    return app
