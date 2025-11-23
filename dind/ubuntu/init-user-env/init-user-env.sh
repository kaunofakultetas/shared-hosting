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




# STEP 1: Copy /apps/sistema apps from image to mounted volume
if [ -d "/opt/default-apps/sistema" ]; then
    echo "Copying system apps to /apps/sistema ..."
    
    # Check if /apps/sistema is empty or doesn't exist
    if [ ! -d "/apps/sistema" ] || [ -z "$(ls -A /apps/sistema)" ]; then
        cp -r /opt/default-apps/sistema /apps
        echo "System apps copied successfully"
    else
        echo "WARNING: /apps/sistema is not empty, skipping copy to preserve existing data"
    fi
else
    echo "ERROR: /opt/default-apps/sistema not found in image"
    exit 1
fi


# STEP 2: Copy /apps/aplikacijos home directory files from image to mounted volume
if [ -d "/opt/default-apps/aplikacijos" ]; then
    echo "Copying home directory files to /apps/aplikacijos ..."
    
    mkdir -p /apps/aplikacijos
    cp -r /opt/default-apps/aplikacijos/.* /apps/aplikacijos/ || true
    cp -r /opt/default-apps/aplikacijos/* /apps/aplikacijos/ || true
else
    echo "ERROR: /opt/default-apps/aplikacijos not found in image"
    exit 1
fi



# STEP 3: Wait for Docker daemon to be ready
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



# STEP 4: Run the setup script
cd /apps/sistema || exit 1

if [ -f "./runUpdateThisStack.sh" ]; then
    echo "Running stack initialization..."
    ./runUpdateThisStack.sh
else
    echo "WARNING: runUpdateThisStack.sh not found"
fi



# STEP 5: Mark initialization as complete
touch "$INIT_MARKER"
echo "User environment initialization complete"