############################################################
#  [*] Portforwarder routes — the TCP forward regeneration
#
#    POST /api/updateportforwarderconfig  — regenerate + reload
############################################################


import json

from flask import Blueprint, Response, request

from .portforwarder_updater import PortforwarderUpdater


portforwarder_bp = Blueprint('portforwarder', __name__)








############################################################
# updateportforwarderconfig_HTTPPOST
############################################################
#
# POST /api/updateportforwarderconfig
#
# The whole port forward table in → a fresh portforwarder
# Caddyfile out, then `caddy reload` in the portforwarder
# container. The backend calls this INSIDE its request
# transaction, and a failed reload answers 500 here — that is
# what actually rolls the forward change back on the backend
# side (a 200 would have let the table and the listeners
# diverge).
#
# The body is a plain JSON object: {"portforwards": [...]} —
# the same contract shape as /api/updatecaddyconfig.
#
# Used by:
#   - control-backend portforward_views — every forward
#     mutation
#   - control-backend vm_views — after a VM delete
############################################################

@portforwarder_bp.route('/api/updateportforwarderconfig', methods=['POST'])
def updateportforwarderconfig_HTTPPOST():
    # Get the data from the request
    data = request.get_json()

    # Update the portforwarder Caddyfile configuration
    portforwarderUpdater = PortforwarderUpdater()
    caddy_config = portforwarderUpdater.generate_caddyfile(data['portforwards'])
    portforwarderUpdater.save_caddyfile(caddy_config)

    # A failed reload means the new file is NOT serving — the
    # caller must treat the whole operation as failed
    if not portforwarderUpdater.reload_portforwarder():
        return Response(json.dumps({'error': 'Portforwarder reload failed'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'Portforwarder config updated'}), mimetype='application/json')
