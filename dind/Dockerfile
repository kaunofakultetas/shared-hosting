FROM nestybox/ubuntu-noble-systemd-docker


# Install cli tools
RUN apt update && apt install -y \
    iputils-ping traceroute net-tools nmap htop nano psmisc


# Install docker-compose
RUN curl -L https://github.com/docker/compose/releases/download/v2.32.4/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
RUN chmod +x /usr/local/bin/docker-compose


# Fix gateway
COPY fix-gateway.sh /usr/local/bin/fix-gateway.sh
RUN chmod +x /usr/local/bin/fix-gateway.sh
COPY fix-gateway.service /etc/systemd/system/fix-gateway.service
RUN systemctl enable fix-gateway.service


# Add admin user to sudo group and grant sudo privileges
RUN usermod -aG sudo admin && echo '%sudo ALL=(ALL:ALL) NOPASSWD:ALL' >> /etc/sudoers


# Set it as default login directory for root and admin bash shells
RUN echo 'cd /apps/aplikacijos' >> /root/.bashrc && \
    echo 'cd /apps/aplikacijos' >> /home/admin/.bashrc && \
    echo 'sudo -i' >> /home/admin/.bashrc
