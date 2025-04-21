#!/usr/bin/env bash

ip route del default || true
ip route add default via 172.19.2.1
