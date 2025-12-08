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
sudo curl -L https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

<br>

### 3. Install Sysbox Runtime
Run the commands in the terminal:
```bash
wget https://github.com/nestybox/sysbox/releases/download/v0.6.7/sysbox-ce_0.6.7.linux_amd64.deb
sudo dpkg -i sysbox-ce_0.6.7.linux_amd64.deb
rm sysbox-ce_0.6.7.linux_amd64.deb
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
    "bip": "172.20.0.1/16",
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

### 6. Port Forwarding Configuration
Configure port forwarding on your router to route traffic from two public IP addresses to the Docker host.

**Requirement**: You need **two public IP addresses**:
- One for the control panel (e.g., `158.129.172.221`)
- One for user applications (e.g., `158.129.172.222`)

**Control IP Port Forwarding** (e.g., 158.129.172.221 → hosting.knf.vu.lt):
| Public Port | Server Port | Protocol | Purpose |
|-------------|-------------|----------|---------|
| 22 | 10022 | TCP | SSH access |
| 80 | 80 | TCP | HTTP (redirect) |
| 443 | 443 | TCP | HTTPS (control panel) |
| 8443 | 8443 | TCP | HTTPS (VM management) |

**User Apps IP Port Forwarding** (e.g., 158.129.172.222 → knf-hosting.lt):
| Public Port | Server Port | Protocol | Purpose |
|-------------|-------------|----------|---------|
| 80 | 10080 | TCP | HTTP (user apps) |
| 443 | 10443 | TCP | HTTPS (user apps) |

Example router configuration:
```
# Control IP (158.129.172.221)
158.129.172.221:22   → {server}:10022
158.129.172.221:80   → {server}:80
158.129.172.221:443  → {server}:443
158.129.172.221:8443 → {server}:8443

# User Apps IP (158.129.172.222)
158.129.172.222:80   → {server}:10080
158.129.172.222:443  → {server}:10443
```

Replace `{server}` with your Docker host's internal IP address.

<br>

### 7. DNS Configuration
Configure DNS records for both public IP addresses.

**Control Panel Domain** (e.g., `hosting.knf.vu.lt`):
```
hosting.knf.vu.lt    A    158.129.172.221    (Control IP)
```

**User Applications Domain** (e.g., `knf-hosting.lt`):
```
knf-hosting.lt       A    158.129.172.222    (User Apps IP)
*.knf-hosting.lt     A    158.129.172.222    (Wildcard for subdomains)
```

The wildcard record (`*.knf-hosting.lt`) allows users to create subdomains like `myapp.knf-hosting.lt` without additional DNS configuration.

<br>

### 8. Update Caddy Configuration
Edit the control panel domain in the Caddyfile (default is `hosting.knf.vu.lt`):
```bash
nano ./control-modules/control-caddy/Caddyfile
```

Replace `hosting.knf.vu.lt` with your control panel domain name.

<br>

### 9. Start Shared Hosting System
```bash
./runUpdateThisStack.sh
```

<br>

### 10. Access
- **Control Panel**: https://hosting.knf.vu.lt
- **SSH Access**: `ssh server{id}@hosting.knf.vu.lt`
- **User Apps**: https://myapp.knf-hosting.lt (after configuration)
