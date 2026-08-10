############################################################
#  [*] Caddy routes — the users-Caddyfile regeneration
#
#    POST /api/updatecaddyconfig  — regenerate + reload
############################################################


import json

from flask import Blueprint, Response, request

from .caddyfile_updater import CaddyfileUpdater


caddy_bp = Blueprint('caddy', __name__)








############################################################
# updatecaddyconfig_HTTPPOST
############################################################
#
# POST /api/updatecaddyconfig
#
# The whole domain table in → a fresh users Caddyfile out,
# then `caddy reload` in the users Caddy container. The
# backend calls this INSIDE its request transaction, and a
# failed reload answers 500 here — that is what actually
# rolls the domain change back on the backend side (a 200
# would have let the table and the Caddyfile diverge).
#
# The body is a plain JSON object: {"domains": [...]} (the
# old double-encoded string-of-JSON contract is gone — the
# backend sends the object directly).
#
# Used by:
#   - control-backend dns_views — every domain mutation
#   - control-backend vm_views — after a VM delete
############################################################

@caddy_bp.route('/api/updatecaddyconfig', methods=['POST'])
def updatecaddyconfig_HTTPPOST():
    # Get the data from the request
    data = request.get_json()

    # Update the Caddyfile configuration
    caddyUpdater = CaddyfileUpdater()
    caddy_config = caddyUpdater.generate_caddyfile(data['domains'])
    caddyUpdater.save_caddyfile(caddy_config)

    # A failed reload means the new file is NOT serving — the
    # caller must treat the whole operation as failed
    if not caddyUpdater.reload_caddy():
        return Response(json.dumps({'error': 'Caddy reload failed'}), mimetype='application/json', status=500)

    return Response(json.dumps({'message': f'Caddy config updated'}), mimetype='application/json')
