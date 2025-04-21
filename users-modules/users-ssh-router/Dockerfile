# users-ssh-router/Dockerfile
FROM ubuntu:22.04

# Install OpenSSH server
RUN apt-get update && apt-get install -y openssh-server openssh-client && apt-get clean

# Create run directory for sshd
RUN mkdir /var/run/sshd

# Copy in our custom sshd config and ForceCommand script
COPY sshd_config /etc/ssh/sshd_config
COPY route_user.sh /usr/local/bin/route_user.sh
RUN chmod +x /usr/local/bin/route_user.sh

# For demonstration, set a universal password "secret" for any user
# We'll store the hashed password in /etc/shadow-like file. We'll do a normal root user for controlling the container, but
# this won't matter for the forced script.  We just need a known password for "any" login attempts
RUN echo "root:$(openssl passwd -1 secret)" > /sshd_passwords
# We'll pass 'AuthorizedKeysFile none' so we rely solely on PasswordAuthentication

EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
