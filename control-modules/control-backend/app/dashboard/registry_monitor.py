############################################################
# Author:           Tomas Vanagas
# Updated:          2025-11-28
# Version:          1.0
# Description:      Monitor Docker Hub pull rate limit
############################################################


import requests
import sys


def get_rate_limit():
    """Get Docker Hub rate limit information"""
    
    # Step 1: Get authentication token
    token_url = "https://auth.docker.io/token"
    token_params = {
        "service": "registry.docker.io",
        "scope": "repository:ratelimitpreview/test:pull"
    }
    
    try:
        token_response = requests.get(token_url, params=token_params)
        token_response.raise_for_status()
        token = token_response.json()["token"]
    except Exception as e:
        print(f"Error getting token: {e}")
        return None
    
    
    # Step 2: Check rate limit
    registry_url = "https://registry-1.docker.io/v2/ratelimitpreview/test/manifests/latest"
    headers = {"Authorization": f"Bearer {token}"}
    
    try:
        response = requests.head(registry_url, headers=headers)
        response.raise_for_status()
        
        # Extract rate limit headers
        limit = response.headers.get("ratelimit-limit", "").split(";")[0]
        remaining = response.headers.get("ratelimit-remaining", "").split(";")[0]
        source_ip = response.headers.get("docker-ratelimit-source", "").strip()
        
        if limit and remaining:
            limit = int(limit)
            remaining = int(remaining)
            used = limit - remaining
            percent = (remaining * 100) // limit
            
            return {
                "limit": limit,
                "remaining": remaining,
                "used": used,
                "percent": percent,
                "ip": source_ip
            }
    except Exception as e:
        print(f"Error checking rate limit: {e}")
        return None

