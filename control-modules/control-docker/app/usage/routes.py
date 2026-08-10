############################################################
#  [*] Usage routes — per-VM disk measurement
#
#    GET  /api/usage/disk  — du -sb over /SERVERS
############################################################


import json
import os
from subprocess import Popen, PIPE

from flask import Blueprint, Response


usage_bp = Blueprint('usage', __name__)








############################################################
# usagedisk_HTTPGET
############################################################
#
# GET /api/usage/disk
#
# {"usage": {"<id>": <bytes>}} — one du -sb per live VM data
# directory. Slow by nature (the inner docker trees are big);
# the caller runs it from a background thread with a generous
# timeout, and Flask's threaded server keeps the 3-second
# status calls flowing meanwhile.
#
# Used by:
#   - control-backend monitor_containers — refresh_disk_usage
#     every ~5 minutes
############################################################

@usage_bp.route('/api/usage/disk', methods=['GET'])
def usagedisk_HTTPGET():
    json_obj = {'usage': {}}

    # Mounted read-only by compose (./SERVERS:/SERVERS:ro).
    # Only live VM dirs (pure numeric names) are measured — the
    # renamed "<id>-deleted-<timestamp>" archives are skipped.
    servers_dir = '/SERVERS'
    if not os.path.isdir(servers_dir):
        return Response(json.dumps({'message': 'SERVERS is not mounted'}, indent=4), mimetype='application/json', status=500)

    for entry in sorted(os.listdir(servers_dir)):
        if not entry.isdigit():
            continue

        # du prints the total even when parts of the tree are
        # unreadable, so the output matters, not the exit code
        process = Popen(['du', '-sb', os.path.join(servers_dir, entry)], stdout=PIPE, stderr=PIPE)
        stdout, stderr = process.communicate()
        if stdout:
            try:
                json_obj['usage'][entry] = int(stdout.split()[0])
            except (ValueError, IndexError):
                pass

    return Response(json.dumps(json_obj, indent=4), mimetype='application/json')
