# System Installation

### 1. Prerequisites
- Ubuntu Server 24.04.2 LTS Operating system

<br>

### 2. Install Docker and Docker Compose
Run the commands in the terminal:
```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y docker.io
sudo curl -L https://github.com/docker/compose/releases/download/v2.37.1/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

<br>

### 3. Install Sysbox Runtime
Run the commands in the terminal:
```bash
wget https://downloads.nestybox.com/sysbox/releases/v0.6.7/sysbox-ce_0.6.7-0.linux_amd64.deb
sudo dpkg -i sysbox-ce_0.6.7-0.linux_amd64.deb
rm sysbox-ce_0.6.7-0.linux_amd64.deb
```

<br>

### 4. Docker Configuration
Configure Docker's default address pools to avoid IP conflicts.
Open and edit docker config file:
```bash
sudo nano /etc/docker/daemon.json
```

```json
{
    "runtimes": {
        "sysbox-runc": {
            "path": "/usr/bin/sysbox-runc"
        }
    },
    "default-address-pools": [
        { "base": "172.20.0.0/16", "size": 24 },
        { "base": "172.21.0.0/16", "size": 24 },
        { "base": "172.22.0.0/16", "size": 24 },
        { "base": "172.23.0.0/16", "size": 24 }
    ]
}
```

After adding this configuration, restart the Docker daemon:
```bash
sudo systemctl restart docker
```

<br>

### 5. Download Shared Hosting Platform
Locate your terminal in a place you want to install the system:
```bash
git clone https://github.com/kaunofakultetas/shared-hosting.git
cd shared-hosting
```

<br>

### 6. Portforward Ports
Portforward system to two external IP addreses using your router.
For the control IP address you will need to portforward:
```
server-ip:20080 --> control-external-ip:80
server-ip:20443 --> control-external-ip:443
```

And for the shared hosted users apps:
```
server-ip:10080 --> users-apps-external-ip:80
server-ip:10443 --> users-apps-external-ip:443
```

<br>

### 7. Control Panel Domain Name
Configure control panel domain name for the control panel (```Default is hosting.knf.vu.lt```).
Locate your terminal to the hosting system folder and open a Caddy configuration and edit:
```bash
nano ./control-modules/control-caddy/Caddyfile
```

Using your domain name provider configure your domain name to point to your control-external-ip.

<br>

### 8. Start Shared Hosting System
```bash
sudo docker-compose up -d
```

<br>

### 9. Access
Open browser and locate: https://control-external-ip
