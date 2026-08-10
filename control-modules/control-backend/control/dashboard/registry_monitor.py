############################################################
#  [*] Registry monitor — Docker Hub pull rate limits
#
#  Asks Docker Hub's auth + registry endpoints how many
#  anonymous pulls remain. The backend has no internet — the
#  compose extra_hosts pin auth.docker.io / registry-1.docker.io
#  to the hosting-control-backend-exit SNI proxy, the one
#  whitelisted way out.
#
#  The result (success OR failure) is cached for 60 seconds
#  per worker: the admin dashboard polls its endpoint every
#  2 seconds, and without the cache each poll would pay both
#  outbound calls — with the registry unreachable, two 2 s
#  timeouts per poll.
############################################################

import time

import requests


CACHE_TTL_SECONDS = 60

_cache = {'checked_at': None, 'value': None}








############################################################
# get_rate_limit
############################################################
#
# {limit, remaining, used, percent, ip} or None. The check
# costs one pull against the preview repo, so the cache also
# keeps the check itself from eating the budget it measures.
#
# Used by:
#   - dashboard_views.dashboard_system
############################################################

def get_rate_limit():

    # Serve from cache — successes and failures alike
    if _cache['checked_at'] is not None and time.monotonic() - _cache['checked_at'] < CACHE_TTL_SECONDS:
        return _cache['value']

    _cache['checked_at'] = time.monotonic()
    _cache['value'] = None


    # Step 1: Get authentication token
    token_url = 'https://auth.docker.io/token'
    token_params = {
        'service': 'registry.docker.io',
        'scope': 'repository:ratelimitpreview/test:pull',
    }

    try:
        token_response = requests.get(token_url, params=token_params, timeout=2)
        token_response.raise_for_status()
        token = token_response.json()['token']
    except Exception as e:
        print(f'Error getting token: {e}')
        return None


    # Step 2: Check rate limit
    registry_url = 'https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest'
    headers = {'Authorization': f'Bearer {token}'}

    try:
        response = requests.head(registry_url, headers=headers, timeout=2)
        response.raise_for_status()

        # Extract rate limit headers
        limit = response.headers.get('ratelimit-limit', '').split(';')[0]
        remaining = response.headers.get('ratelimit-remaining', '').split(';')[0]
        source_ip = response.headers.get('docker-ratelimit-source', '').strip()

        if limit and remaining:
            limit = int(limit)
            remaining = int(remaining)
            used = limit - remaining
            percent = (remaining * 100) // limit

            _cache['value'] = {
                'limit': limit,
                'remaining': remaining,
                'used': used,
                'percent': percent,
                'ip': source_ip,
            }
            return _cache['value']
    except Exception as e:
        print(f'Error checking rate limit: {e}')

    return None
