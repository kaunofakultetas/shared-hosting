FROM nestybox/ubuntu-noble-systemd-docker


#################### BASIC TOOLS INSTALLATION ##########################
# Install cli tools
RUN apt update && apt install -y \
    iputils-ping traceroute net-tools nmap htop nano psmisc

# Install docker-compose
RUN curl -L https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
RUN chmod +x /usr/local/bin/docker-compose
########################################################################




#################### USER ENVIRONMENT INITIALIZATION ###################
# Fix gateway
COPY fix-gateway/fix-gateway.sh /usr/local/bin/fix-gateway.sh
RUN chmod +x /usr/local/bin/fix-gateway.sh
COPY fix-gateway/fix-gateway.service /etc/systemd/system/fix-gateway.service
RUN systemctl enable fix-gateway.service

# Restrict SSH access to webssh2 network only
COPY sshd-config/01-restrict-access.conf /etc/ssh/sshd_config.d/01-restrict-access.conf
RUN chmod 644 /etc/ssh/sshd_config.d/01-restrict-access.conf

# Initialize default docker containers on first boot
COPY init-user-env/apps /opt/default-apps
COPY init-user-env/init-user-env.sh /usr/local/bin/init-user-env.sh
RUN chmod +x /usr/local/bin/init-user-env.sh
COPY init-user-env/init-user-env.service /etc/systemd/system/init-user-env.service
RUN systemctl enable init-user-env.service
########################################################################




# Add admin user to sudo group and grant sudo privileges
RUN usermod -aG sudo admin && echo '%sudo ALL=(ALL:ALL) NOPASSWD:ALL' >> /etc/sudoers


# Set it as default login directory for root and admin bash shells
RUN echo 'cd /apps/aplikacijos' >> /root/.bashrc && \
    echo 'cd /apps/aplikacijos' >> /home/admin/.bashrc && \
    echo 'sudo -i' >> /home/admin/.bashrc
