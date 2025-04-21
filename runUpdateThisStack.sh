#!/bin/bash

mkdir -p control-modules/control-docs/app_data
mkdir -p control-modules/control-docs/db_data
sudo chown -R 1000:1000 control-modules/control-docs


mkdir -p SERVERS
mkdir -p users-modules/users-sshr


# Build student environment
sudo docker build -t hosting-users-dind -f ./dind/Dockerfile ./dind


sudo docker network create --subnet=172.18.0.0/24 external
sudo docker-compose down
sudo docker-compose up -d --build