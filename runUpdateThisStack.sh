#!/bin/bash

################## HOSTING MODULES DATA DIRECTORIES AND FILES ##########################
# Control backend database
mkdir -p _DATA/control-backend


# Create Docs directories
mkdir -p _DATA/control-docs/app_data
mkdir -p _DATA/control-docs/db_data
sudo chown -R 1000:1000 _DATA/control-docs


# Create users-caddy directories
mkdir -p _DATA/users-caddy
touch _DATA/users-caddy/Caddyfile
########################################################################################



# Create SERVERS directory
mkdir -p SERVERS


# Build student environment
sudo docker build -t hosting-users-dind -f ./dind/Dockerfile ./dind





######################### GENERATE AND STORE BOOKSTACK_APP_KEY #########################
# Only generate if BOOKSTACK_APP_KEY doesn't exist in .env
if [ ! -f .env ] || ! grep -q "^BOOKSTACK_APP_KEY=" .env; then
    echo "Generating BOOKSTACK_APP_KEY..."
    BOOKSTACK_APP_KEY="base64:$(openssl rand -base64 32)"
    
    echo "BOOKSTACK_APP_KEY=$BOOKSTACK_APP_KEY" >> .env
    echo "BOOKSTACK_APP_KEY added to .env"
    echo "BOOKSTACK_APP_KEY: $BOOKSTACK_APP_KEY"
fi
#########################################################################################




# Create network and start containers
sudo docker network create --subnet=172.18.0.0/24 external
sudo docker-compose down
sudo docker-compose up -d --build