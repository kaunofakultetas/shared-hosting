#!/bin/bash

sudo docker-compose down hosting-control-caddy
sudo find ./control-modules/control-caddy/caddy_data/caddy/certificates -type f -exec rm {} \;
sudo docker-compose up -d --build hosting-control-caddy
