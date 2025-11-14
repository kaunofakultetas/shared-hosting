#!/bin/bash


# Control backend database
mkdir -p _DATA/control-backend


# Create Docs directories
mkdir -p control-modules/control-docs/app_data
mkdir -p control-modules/control-docs/db_data
sudo chown -R 1000:1000 control-modules/control-docs


# Create users-caddy directories
mkdir -p users-modules/users-caddy
touch users-modules/users-caddy/Caddyfile


# Create SERVERS directory
mkdir -p SERVERS


# Create users-sshr directory
mkdir -p users-modules/users-sshr


# Build student environment
sudo docker build -t hosting-users-dind -f ./dind/Dockerfile ./dind


# Create network and start containers
sudo docker network create --subnet=172.18.0.0/24 external
sudo docker-compose down
sudo docker-compose up -d --build