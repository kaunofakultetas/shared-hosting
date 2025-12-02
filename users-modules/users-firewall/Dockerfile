FROM ubuntu:24.04

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive \
    apt-get install -y iproute2 inetutils-ping curl host mtr-tiny tcpdump iptables net-tools dnsmasq \
    && rm -rf /var/lib/apt/lists/*