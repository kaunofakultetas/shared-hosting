#!/usr/bin/env bash
set -e


# STEP 0: Check Marker
# Marker file to prevent re-running on container restarts
INIT_MARKER="/var/lib/docker-user-init-done"

if [ -f "$INIT_MARKER" ]; then
    echo "User environment already initialized. Skipping..."
    exit 0
fi
echo "Initializing user environment..."




# STEP 1: Copy default apps from image to mounted volume
if [ -d "/opt/default-apps" ]; then
    echo "Copying default apps to /apps..."
    
    # Check if /apps is empty or doesn't exist
    if [ ! -d "/apps" ] || [ -z "$(ls -A /apps)" ]; then
        cp -r /opt/default-apps/* /apps/
        echo "Default apps copied successfully"
    else
        echo "WARNING: /apps is not empty, skipping copy to preserve existing data"
    fi
else
    echo "ERROR: /opt/default-apps not found in image"
    exit 1
fi



# STEP 2: Wait for Docker daemon to be ready
timeout=30
while [ $timeout -gt 0 ]; do
    if docker info >/dev/null 2>&1; then
        echo "Docker daemon is ready"
        break
    fi
    echo "Waiting for Docker daemon..."
    sleep 2
    timeout=$((timeout - 2))
done

if [ $timeout -le 0 ]; then
    echo "ERROR: Docker daemon did not start in time"
    exit 1
fi



# STEP 3: Run the setup script
cd /apps/sistema || exit 1
if [ -f "./runUpdateThisStack.sh" ]; then
    echo "Running stack initialization..."
    ./runUpdateThisStack.sh
else
    echo "WARNING: runUpdateThisStack.sh not found"
fi



# STEP 4: Mark initialization as complete
touch "$INIT_MARKER"
echo "User environment initialization complete"