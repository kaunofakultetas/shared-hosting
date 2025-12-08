# Network Topology and Security

This document details the network architecture, isolation mechanisms, and security controls implemented in the App Hosting Platform.

---

## 1. Network Design Philosophy

### 1.1 Core Principles

1. **Defense in Depth**: Multiple network boundaries between untrusted and trusted zones
2. **Least Privilege**: Each component only has network access it requires
3. **Isolation**: User workloads cannot access control plane or other users
4. **Controlled Egress**: Outbound traffic is filtered and monitored

### 1.2 Network Zones

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ┌─────────────┐                                                       │
│   │  EXTERNAL   │  Internet-facing zone                                 │
│   │   NETWORK   │  • Ingress proxies                                    │
│   │             │  • SSH router                                         │
│   └──────┬──────┘                                                       │
│          │                                                              │
│   ┌──────▼──────────────────────────────────────────────────────────┐   │
│   │              CONTROL PLANE NETWORKS                             │   │
│   │                                                                 │   │
│   │   ┌───────────────────────┐    ┌───────────────────────┐        │   │
│   │   │ isolated-control-panel│    │isolated-control-docker│        │   │
│   │   │     172.19.0.0/24     │    │    172.19.1.0/24      │        │   │
│   │   │                       │    │                       │        │   │
│   │   │ • Frontend            │    │ • Docker Controller   │        │   │
│   │   │ • Backend             │    │ • cAdvisor            │        │   │
│   │   │ • Documentation       │    │ • Docker Socket Proxy │        │   │
│   │   │ • Database            │    │                       │        │   │
│   │   └───────────────────────┘    └───────────────────────┘        │   │
│   │            ▲                              ▲                     │   │
│   │            │ Internal only                │ Internal only       │   │
│   │            │ (no internet)                │ (no internet)       │   │
│   └────────────┼──────────────────────────────┼─────────────────────┘   │
│                │                              │                         │
│   ┌────────────▼──────────────────────────────▼─────────────────────┐   │
│   │                    USER PLANE NETWORK                           │   │
│   │                                                                 │   │
│   │   ┌──────────────────────────────────────────────────────────┐  │   │
│   │   │              filtered-users                              │  │   │
│   │   │              172.19.2.0/24                               │  │   │
│   │   │                                                          │  │   │
│   │   │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │  │   │
│   │   │  │ Firewall │  │  Caddy   │  │  Cache   │  │ Virtual  │  │  │   │
│   │   │  │172.19.2.1│  │172.19.2.2│  │172.19.2.4│  │ Servers  │  │  │   │
│   │   │  └────┬─────┘  └──────────┘  └──────────┘  └──────────┘  │  │   │
│   │   │       │                                                  │  │   │
│   │   │       ▼ Controlled egress to internet                    │  │   │
│   │   └──────────────────────────────────────────────────────────┘  │   │
│   │                                                                 │   │
│   └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Network Definitions

### 2.1 External Network

```yaml
networks:
  external:
    name: external
    external: true  # Pre-existing Docker network with internet access
```

**Purpose**: Provides internet connectivity to ingress components.

**Connected Services**:
- `hosting-control-caddy` (ports 80, 443, 8443)
- `hosting-users-caddy` (ports 10080, 10443)
- `hosting-users-ssh-router` (port 10022)
- `hosting-users-firewall` (NAT gateway)

---

### 2.2 Isolated Control Panel Network

```yaml
networks:
  isolated-control-panel:
    name: isolated-control-panel
    driver: bridge
    internal: true  # No external connectivity
    ipam:
      config:
        - subnet: 172.19.0.0/24
          gateway: 172.19.0.1
```

**Purpose**: Internal network for control plane services.

**Security Properties**:
- `internal: true` prevents any external routing
- Services can only communicate within this subnet
- No default gateway to internet

**Connected Services**:
| Service | IP Address | Purpose |
|---------|------------|---------|
| control-frontend | Dynamic | Web UI |
| control-backend | Dynamic | API server |
| control-backend-exit | 172.19.0.30 | DockerHub API proxy |
| control-docs-web | Dynamic | Documentation |
| control-docs-mariadb | Dynamic | Docs database |
| control-swagger | Dynamic | API docs |
| control-dbgate | Dynamic | DB browser |

---

### 2.3 Isolated Control Docker Network

```yaml
networks:
  isolated-control-docker:
    name: isolated-control-docker
    driver: bridge
    internal: true  # No external connectivity
    ipam:
      config:
        - subnet: 172.19.1.0/24
          gateway: 172.19.1.1
```

**Purpose**: Isolated network for Docker management operations.

**Security Properties**:
- Separates Docker socket access from other control services
- Only Docker Controller and monitoring have access
- Reduces attack surface if backend is compromised

**Connected Services**:
| Service | Purpose |
|---------|---------|
| control-docker | Docker API operations |
| control-cadvisor | Container monitoring |
| control-dockersocket | Docker API proxy to users |

---

### 2.4 Filtered Users Network

```yaml
networks:
  filtered-users:
    name: filtered-users
    driver: bridge
    internal: false  # External routing available
    driver_opts:
      com.docker.network.bridge.enable_ip_masquerade: 'false'  # Custom NAT
    ipam:
      config:
        - subnet: 172.19.2.0/24
          ip_range: 172.19.2.128/25  # Dynamic IPs: 172.19.2.128-254
          gateway: 172.19.2.254
```

**Purpose**: Network for user virtual servers with controlled internet access.

**Key Configuration**:
- `internal: false` allows routing to external network
- `enable_ip_masquerade: false` disables Docker's default NAT
- Custom firewall container provides NAT and filtering
- `ip_range` reserves 172.19.2.1-127 for static assignments

**Static IP Assignments**:
| IP Address | Service | Purpose |
|------------|---------|---------|
| 172.19.2.1 | users-firewall | Default gateway + DNS |
| 172.19.2.2 | control-caddy | Reverse proxy access |
| 172.19.2.3 | users-caddy | User app proxy |
| 172.19.2.4 | dockerhub-cache | Image cache |
| 172.19.2.5 | ssh-router | SSH access |
| 172.19.2.11 | dockersocket | Docker API proxy |
| 172.19.2.128+ | Virtual servers | Dynamic assignment |

---

## 3. Firewall Configuration

### 3.1 Firewall Container (`hosting-users-firewall`)

The firewall container acts as the default gateway for all user virtual servers.

**Initialization Script**:
```bash
# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1

# Clear existing rules
iptables -F
iptables -t nat -F
iptables -t nat -X

# Default policy: DROP all forwarded traffic
iptables -P FORWARD DROP

# Block access to private networks (prevent lateral movement)
iptables -A FORWARD -s 172.19.2.0/24 -d 172.16.0.0/12 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 192.168.0.0/16 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 10.0.0.0/8 -j DROP

# Allow outbound internet traffic
iptables -A FORWARD -s 172.19.2.0/24 -j ACCEPT

# Allow established/related return traffic
iptables -A FORWARD -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# NAT outbound traffic through external interfaces
iptables -t nat -A POSTROUTING -s 172.19.2.0/24 -o eth0 -j MASQUERADE
iptables -t nat -A POSTROUTING -s 172.19.2.0/24 -o eth1 -j MASQUERADE
```

### 3.2 Firewall Rules Explained

| Rule | Purpose |
|------|---------|
| `FORWARD DROP` | Default deny for forwarded traffic |
| Block 172.16.0.0/12 | Prevent access to Docker networks |
| Block 192.168.0.0/16 | Prevent access to local networks |
| Block 10.0.0.0/8 | Prevent access to internal networks |
| Allow from 172.19.2.0/24 | Allow user subnet outbound |
| ESTABLISHED,RELATED | Allow return traffic |
| MASQUERADE | NAT source addresses |

### 3.3 DNS Configuration

```bash
dnsmasq --no-daemon --no-resolv --server=8.8.8.8 --server=1.1.1.1 --log-queries
```

- Listens on 172.19.2.1:53
- Forwards to Google and Cloudflare DNS
- Logs all queries for monitoring

---

## 4. Geographic Access Control

### 4.1 Caddy Geo-Blocking

The control panel restricts access to VU (Vilnius University) networks only.

**Allowed Networks**:
```
# Local/VPN ranges
172.16.0.1/16      # Docker internal
192.168.0.1/16     # Private
10.0.0.1/8         # Private

# VU VPN
193.219.95.0/24    # VU VPN
10.198.0.0/16      # VU VPN internal
158.129.162.0/24   # VU VPN

# VU KNF External
158.129.172.0/24   # KnF network
```

**Implementation in Caddyfile**:
```
(geo_block_non_vu) {
    @block_non_vu {
        not {
            import allow_only_vu
        }
    }
    respond @block_non_vu "Access denied" 403
}
```

---

## 5. Traffic Flow Analysis

### 5.1 Control Panel Access

```
User Browser
     │
     │ HTTPS (443)
     ▼
┌─────────────────┐
│ control-caddy   │
│ (TLS termination│
│  + geo-block)   │
└────────┬────────┘
         │
         │ Check: VU network?
         │
    ┌────┴────┐
    │         │
   YES       NO
    │         │
    ▼         ▼
Forward   Block
to app    (403)
```

### 5.2 User Application Access

```
External User
     │
     │ HTTPS (:443)
     │ via knf-hosting.lt
     ▼
┌─────────────────┐
│  Router         │
│ (443 → 10443)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  users-caddy    │
│ (TLS + routing) │
└────────┬────────┘
         │
         │ Match domain to virtual server
         ▼
┌─────────────────┐
│ virtual-server  │
│  (user's app)   │
└─────────────────┘
```

### 5.3 SSH Access

```
User SSH Client
     │
     │ SSH (:22)
     │ via hosting.knf.vu.lt
     ▼
┌─────────────────┐
│  Router         │
│ (22 → 10022)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   ssh-router    │
│ (auth + route)  │
└────────┬────────┘
         │
         │ 1. Extract server ID from username
         │ 2. Query backend for auth
         │ 3. Verify password
         ▼
┌─────────────────┐
│ virtual-server  │
│  (SSH server)   │
└─────────────────┘
```

### 5.4 Virtual Server Outbound

```
Virtual Server Container
     │
     │ Internet request
     ▼
┌─────────────────┐
│  users-firewall │
│   (gateway)     │
└────────┬────────┘
         │
    ┌────┴────────────┐
    │                 │
    ▼                 ▼
Private IP?       Public IP?
    │                 │
   DROP            FORWARD
                      │
                      ▼
                ┌─────────────┐
                │  Internet   │
                │ (MASQUERADE)│
                └─────────────┘
```

---

## 6. Router Port Forwarding

The platform uses two public IP addresses with router-level port forwarding to route traffic to the internal Docker host.

### 6.1 Network Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INTERNET                                       │
│                                                                         │
│    ┌─────────────────────────┐      ┌─────────────────────────┐         │
│    │   Control IP Address    │      │   User Apps IP Address  │         │
│    │   158.129.172.221       │      │   158.129.172.222       │         │
│    │   hosting.knf.vu.lt     │      │   knf-hosting.lt        │         │
│    │                         │      │   *.knf-hosting.lt      │         │
│    └───────────┬─────────────┘      └───────────┬─────────────┘         │
│                │                                │                        │
└────────────────┼────────────────────────────────┼────────────────────────┘
                 │                                │
┌────────────────▼────────────────────────────────▼────────────────────────┐
│                           ROUTER / FIREWALL                              │
│                                                                         │
│    Control IP Forwarding:           User Apps IP Forwarding:            │
│    :22  → server:10022              :80  → server:10080                 │
│    :80  → server:80                 :443 → server:10443                 │
│    :443 → server:443                                                    │
│    :8443→ server:8443                                                   │
│                                                                         │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           DOCKER HOST                                    │
│                                                                         │
│    ┌──────────────────────────┐     ┌──────────────────────────┐        │
│    │   hosting-control-caddy  │     │   hosting-users-caddy    │        │
│    │   :80, :443, :8443       │     │   :10080, :10443         │        │
│    └──────────────────────────┘     └──────────────────────────┘        │
│                                                                         │
│    ┌──────────────────────────┐                                         │
│    │  hosting-users-ssh-router│                                         │
│    │   :10022                 │                                         │
│    └──────────────────────────┘                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Public DNS Configuration

| Domain | Type | Points To | Purpose |
|--------|------|-----------|---------|
| `hosting.knf.vu.lt` | A | 158.129.172.221 | Control panel |
| `knf-hosting.lt` | A | 158.129.172.222 | User applications |
| `*.knf-hosting.lt` | A (Wildcard) | 158.129.172.222 | User subdomains |

**Control Domain** (`hosting.knf.vu.lt`):
- Used for administrator and user login
- Hosts the web interface, API, documentation
- VM management panels on port 8443
- SSH access on port 22

**User Applications Domain** (`knf-hosting.lt`):
- Dedicated to hosting user applications
- Wildcard DNS allows any subdomain (e.g., `myapp.knf-hosting.lt`)
- Users can also configure custom domains

### 6.3 Router Port Forwarding Rules

**Control IP (158.129.172.221 → hosting.knf.vu.lt)**:

| External Port | Internal Port | Protocol | Service |
|---------------|---------------|----------|---------|
| 22 | 10022 | TCP | SSH Router |
| 80 | 80 | TCP | HTTP (redirect) |
| 443 | 443 | TCP | HTTPS (control panel) |
| 8443 | 8443 | TCP | HTTPS (VM management) |

**User Apps IP (158.129.172.222 → knf-hosting.lt)**:

| External Port | Internal Port | Protocol | Service |
|---------------|---------------|----------|---------|
| 80 | 10080 | TCP | HTTP (user apps) |
| 443 | 10443 | TCP | HTTPS (user apps) |

### 6.4 Docker Host Port Mapping

| Host Port | Container | Internal Port | Protocol | Purpose |
|-----------|-----------|---------------|----------|---------|
| 80 | control-caddy | 80 | HTTP | Redirect to HTTPS |
| 443 | control-caddy | 443 | HTTPS | Control panel |
| 8443 | control-caddy | 8443 | HTTPS | VM management UI |
| 10080 | users-caddy | 80 | HTTP | User apps (HTTP) |
| 10443 | users-caddy | 443 | HTTPS | User apps (HTTPS) |
| 10022 | ssh-router | 2222 | SSH | Terminal access |

### 6.6 Internal Service Ports

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| control-frontend | 3000 | HTTP | Next.js server |
| control-backend | 8000 | HTTP | Flask API |
| control-docker | 8000 | HTTP | Docker Controller |
| control-cadvisor | 8080 | HTTP | Metrics API |
| control-dbgate | 3000 | HTTP | Database UI |
| control-docs-web | 80 | HTTP | BookStack |
| control-swagger | 8080 | HTTP | Swagger UI |

---

## 7. Network Security Checklist

### 7.1 Implemented Controls

| Control | Status | Implementation |
|---------|--------|----------------|
| Network segmentation | ✓ | Four isolated networks |
| Firewall rules | ✓ | iptables in firewall container |
| Geographic restriction | ✓ | Caddy geo-blocking |
| TLS encryption | ✓ | Let's Encrypt certificates |
| Internal network isolation | ✓ | `internal: true` on control networks |
| Egress filtering | ✓ | Block private IP ranges |
| DNS monitoring | ✓ | dnsmasq query logging |

### 7.2 Recommended Enhancements

| Enhancement | Priority | Description |
|-------------|----------|-------------|
| Rate limiting | Medium | Add rate limits at Caddy level |
| DDoS protection | Medium | Cloudflare or similar |
| Network logging | Low | Capture traffic metadata |
| IDS/IPS | Low | Intrusion detection |

---

## 8. Troubleshooting Network Issues

### 8.1 Common Problems

**Virtual server cannot access internet**:
```bash
# Check firewall container is running
docker ps | grep firewall

# Verify iptables rules
docker exec hosting-users-firewall iptables -L -n

# Test DNS resolution
docker exec hosting-users-dind-1 nslookup google.com 172.19.2.1
```

**Control panel not accessible**:
```bash
# Check Caddy container
docker logs hosting-control-caddy

# Verify TLS certificate
curl -v https://hosting.knf.vu.lt

# Check backend health
docker exec hosting-control-backend curl localhost:8000/api/checkauth
```

**User app not accessible via custom domain**:
```bash
# Check users-caddy configuration
docker exec hosting-users-caddy cat /etc/caddy/Caddyfile

# Verify domain DNS
dig myapp.example.com

# Check virtual server is running
docker ps | grep hosting-users-dind
```

---

## Next Document

Continue to [03-AUTHENTICATION.md](03-AUTHENTICATION.md) for authentication and authorization details.

