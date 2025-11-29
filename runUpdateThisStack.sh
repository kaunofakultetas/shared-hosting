#!/bin/bash

################## HOSTING MODULES DATA DIRECTORIES AND FILES ###########################
# Control backend database
mkdir -p _DATA/control-backend
touch _DATA/control-backend/database.db


# Create Docs directories
mkdir -p _DATA/control-docs/app_data
mkdir -p _DATA/control-docs/db_data
sudo chown -R 1000:1000 _DATA/control-docs


# Create control-caddy directories
mkdir -p _DATA/control-caddy/caddy_config
mkdir -p _DATA/control-caddy/caddy_data
mkdir -p _DATA/control-caddy/caddy_logs
mkdir -p _DATA/control-caddy/certs


# Create users-caddy directories
mkdir -p _DATA/users-caddy/caddy_config
mkdir -p _DATA/users-caddy/caddy_data
mkdir -p _DATA/users-caddy/caddy_logs
mkdir -p _DATA/users-caddy/certs
touch _DATA/users-caddy/Caddyfile

# Create users-dockerhub-cache directory
mkdir -p _DATA/users-dockerhub-cache
#########################################################################################



# Create SERVERS directory
mkdir -p SERVERS


# Build student environment
sudo docker build -t hosting-dind-ubuntu -f ./dind/ubuntu/Dockerfile ./dind/ubuntu






################################ CONTROL-DOCKER AUTOSETUP ###############################
# Only generate if ROOT_DIR doesn't exist in .env
if [ ! -f .env ] || ! grep -q "^ROOT_DIR=" .env; then
    echo "Generating ROOT_DIR..."
    ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
    
    echo "" >> .env
    echo "ROOT_DIR=$ROOT_DIR" >> .env
    echo "ROOT_DIR added to .env"
    echo "ROOT_DIR: $ROOT_DIR"
fi
#########################################################################################



################################## BOOKSTACK AUTOSETUP ##################################
# Only generate if BOOKSTACK_APP_KEY doesn't exist in .env
if [ ! -f .env ] || ! grep -q "^BOOKSTACK_APP_KEY=" .env; then
    echo "Generating BOOKSTACK_APP_KEY..."
    BOOKSTACK_APP_KEY="base64:$(openssl rand -base64 32)"
    
    echo "" >> .env
    echo "BOOKSTACK_APP_KEY=$BOOKSTACK_APP_KEY" >> .env
    echo "BOOKSTACK_APP_KEY added to .env"
    echo "BOOKSTACK_APP_KEY: $BOOKSTACK_APP_KEY"
fi
#########################################################################################



################################## SSH ROUTER AUTOSETUP #################################
# Only generate if BACKEND_SSH_API_KEY doesn't exist in .env
if [ ! -f .env ] || ! grep -q "^BACKEND_SSH_API_KEY=" .env; then
    echo "Generating BACKEND_SSH_API_KEY..."
    BACKEND_SSH_API_KEY="$(openssl rand -hex 32)"
    
    echo "" >> .env
    echo "BACKEND_SSH_API_KEY=$BACKEND_SSH_API_KEY" >> .env
    echo "BACKEND_SSH_API_KEY added to .env"
    echo "BACKEND_SSH_API_KEY: $BACKEND_SSH_API_KEY"
fi
#########################################################################################



# Create network and start containers
sudo docker network create --subnet=172.18.0.0/24 external
sudo docker-compose down
sudo docker-compose up -d --build
