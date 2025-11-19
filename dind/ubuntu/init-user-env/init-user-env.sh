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

# Verify docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "ERROR: docker-compose.yml not found in /apps/sistema"
    exit 1
fi

echo "Running stack initialization..."

# Create network (ignore error if it already exists)
docker network create --subnet=172.18.0.0/24 external 2>&1 || echo "Network 'external' already exists, continuing..."

# Stop existing containers (ignore error on first run)
docker compose -f /apps/sistema/docker-compose.yml down 2>&1 || echo "No existing containers to stop, continuing..."

# Start the stack
if docker compose -f /apps/sistema/docker-compose.yml up -d --build --force-recreate; then
    echo "Stack started successfully"
else
    echo "ERROR: Failed to start stack"
    exit 1
fi



# STEP 4: Mark initialization as complete
touch "$INIT_MARKER"
echo "User environment initialization complete"