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

# Setup docker registry pass-through cache
COPY docker-config/daemon.json /etc/docker/daemon.json
RUN chmod 644 /etc/docker/daemon.json
########################################################################




##################### CONFIGURE USER IN A CONTAINER ####################
# Remove ubuntu/admin users if they exist
RUN userdel -r ubuntu || true
RUN userdel -r admin || true

# Set root password to "root"
RUN echo 'root:root' | chpasswd

# Set root home directory
RUN sed -i 's|root:/root|root:/apps/aplikacijos|' /etc/passwd
########################################################################
