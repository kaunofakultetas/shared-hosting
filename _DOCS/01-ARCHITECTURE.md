# System Architecture

This document provides a detailed examination of the App Hosting Platform architecture, describing each component, its responsibilities, and inter-component communication patterns.

---

## 1. Architectural Overview

### 1.1 Design Principles

The platform is built on the following architectural principles:

1. **Defense in Depth**: Multiple layers of security controls
2. **Least Privilege**: Components have minimal required permissions
3. **Isolation**: Strict separation between control and user planes
4. **Statelessness**: API servers are stateless; state is persisted in database
5. **Simplicity**: Single-host deployment minimizes operational complexity

### 1.2 High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 HOST MACHINE                                    │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │                         EXTERNAL NETWORK                                 │   │
│  │                                                                          │   │
│  │    Port 80/443          Port 10080/10443         Port 10022              │   │
│  │         │                      │                      │                  │   │
│  └─────────┼──────────────────────┼──────────────────────┼──────────────────┘   │
│            │                      │                      │                      │
│  ┌─────────▼──────────────────────▼──────────────────────▼──────────────────┐   │
│  │                      INGRESS LAYER                                       │   │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │   │
│  │   │control-caddy│    │ users-caddy │    │ ssh-router  │                  │   │
│  │   │  (Proxy)    │    │   (Proxy)   │    │  (Router)   │                  │   │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │   │
│  └──────────┼──────────────────┼──────────────────┼─────────────────────────┘   │
│             │                  │                  │                             │
│  ┌──────────▼──────────────────┼──────────────────┼─────────────────────────┐   │
│  │              CONTROL PLANE  │                  │                         │   │
│  │   ┌──────────────────────┐  │                  │                         │   │
│  │   │  isolated-control-   │  │                  │                         │   │
│  │   │      panel           │  │                  │                         │   │
│  │   │  ┌────────┐ ┌─────┐  │  │                  │                         │   │
│  │   │  │Frontend│ │ DB  │  │  │                  │                         │   │
│  │   │  └────────┘ │Gate │  │  │                  │                         │   │
│  │   │  ┌────────┐ └─────┘  │  │                  │                         │   │
│  │   │  │Backend │ ┌─────┐  │  │                  │                         │   │
│  │   │  │  API   │ │Docs │  │  │                  │                         │   │
│  │   │  └───┬────┘ └─────┘  │  │                  │                         │   │
│  │   └──────┼───────────────┘  │                  │                         │   │
│  │          │                  │                  │                         │   │
│  │   ┌──────▼───────────────┐  │                  │                         │   │
│  │   │  isolated-control-   │  │                  │                         │   │
│  │   │      docker          │  │                  │                         │   │
│  │   │  ┌──────────────┐    │  │                  │                         │   │
│  │   │  │   Docker     │    │  │                  │                         │   │
│  │   │  │  Controller  │    │  │                  │                         │   │
│  │   │  └──────┬───────┘    │  │                  │                         │   │
│  │   │         │            │  │                  │                         │   │
│  │   │  ┌──────▼───────┐    │  │                  │                         │   │
│  │   │  │  cAdvisor    │    │  │                  │                         │   │
│  │   │  └──────────────┘    │  │                  │                         │   │
│  │   └──────────────────────┘  │                  │                         │   │
│  └─────────────────────────────┼──────────────────┼─────────────────────────┘   │
│                                │                  │                             │
│  ┌─────────────────────────────▼──────────────────▼─────────────────────────┐   │
│  │                         USER PLANE                                       │   │
│  │   ┌──────────────────────────────────────────────────────────────────┐   │   │
│  │   │                    filtered-users network                        │   │   │
│  │   │   ┌────────────┐  ┌────────────┐  ┌────────────┐                 │   │   │
│  │   │   │  firewall  │  │dockerhub   │  │ Virtual    │  ...            │   │   │
│  │   │   │ (gateway)  │  │  cache     │  │ Servers    │                 │   │   │
│  │   │   │ 172.19.2.1 │  │ 172.19.2.4 │  │172.19.2.x  │                 │   │   │
│  │   │   └────────────┘  └────────────┘  └────────────┘                 │   │   │
│  │   └──────────────────────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Control Plane Components

The control plane manages the platform, providing user interfaces, APIs, and orchestration services.

### 2.1 Control Caddy (`hosting-control-caddy`)

**Purpose**: Primary ingress point for the control panel.

**Responsibilities**:
- TLS termination with Let's Encrypt certificates
- Geographic access restriction (VU network only)
- Request routing to backend services
- Authentication forwarding for protected resources

**Configuration Highlights**:
```
{domain} {
    tls {email}
    
    # Geographic blocking
    import geo_block_non_vu
    
    # API routing
    handle /api/* {
        reverse_proxy hosting-control-backend:8000
    }
    
    # Frontend routing
    reverse_proxy hosting-control-frontend:3000
}
```

**Network Connections**:
- Listens: `external:80`, `external:443`, `external:8443`
- Connects to: `isolated-control-panel`, `filtered-users`

---

### 2.2 Control Frontend (`hosting-control-frontend`)

**Purpose**: Web-based user interface for platform management.

**Technology**: Next.js 15 with React

**Key Features**:
- Server-side rendering for SEO and performance
- Role-based UI (Admin vs User views)
- Real-time container status updates
- Responsive design for mobile access

**Page Structure**:
```
/                    → Home / Dashboard redirect
/login               → Authentication page
/admin/              → Admin dashboard
/admin/users         → User management
/admin/servers       → All virtual servers
/vm/{id}             → Virtual server management
/account             → User account settings
```

**Network Connections**:
- Listens: `isolated-control-panel:3000`
- Connects to: Backend API (via internal network)

---

### 2.3 Control Backend (`hosting-control-backend`)

**Purpose**: REST API server providing business logic and data access.

**Technology**: Flask 3.x with Python

**Module Structure**:
```
app/
├── auth/
│   ├── routes.py      # Authentication endpoints
│   └── user.py        # User model and helpers
├── dashboard/
│   ├── routes.py      # Admin dashboard data
│   └── registry_monitor.py  # DockerHub rate limits
├── database/
│   ├── db.py          # Database connection
│   └── db_init.py     # Schema initialization
├── dns_controller/
│   └── routes.py      # Domain management
├── docker/
│   └── monitor.py     # Container status updater
├── ssh_router/
│   └── routes.py      # SSH routing lookup
└── virtual_server/
    └── routes.py      # VM CRUD operations
```

**Background Processes**:
1. **Docker Monitor**: Polls container status every 3 seconds, updates database
2. **Registry Monitor**: Checks DockerHub rate limits periodically

**Network Connections**:
- Listens: `isolated-control-panel:8000`
- Connects to: Docker Controller, Database, External (dev mode)

---

### 2.4 Docker Controller (`hosting-control-docker`)

**Purpose**: Executes Docker operations on behalf of the backend.

**Technology**: Flask + Docker SDK

**Capabilities**:
| Endpoint | Method | Action |
|----------|--------|--------|
| `/api/status/{name}` | GET | Get container status |
| `/api/create/{name}` | GET | Create virtual server |
| `/api/start/{name}` | GET | Start container |
| `/api/stop/{name}` | GET | Stop container |
| `/api/delete/{name}` | GET | Delete container |
| `/api/cleanup/{name}` | GET | Prune unused resources |
| `/api/updatecaddyconfig` | POST | Update Caddy configuration |

**Security Measures**:
- Read-only filesystem
- No external network access
- Container name validation (regex: `^[a-z0-9-]{1,25}$`)

**Network Connections**:
- Listens: `isolated-control-docker:8000`
- Mounts: `/var/run/docker.sock` (Docker API)

---

### 2.5 Container Advisor (`hosting-control-cadvisor`)

**Purpose**: Collects resource usage metrics from containers.

**Technology**: Google cAdvisor

**Metrics Provided**:
- CPU usage (per-container and total)
- Memory consumption
- Disk I/O and usage
- Network statistics

**API Endpoints Used**:
- `/api/v1.3/machine` - Host system information
- `/api/v1.3/containers` - Container statistics

---

### 2.6 Documentation Services

#### BookStack (`hosting-control-docs-web`)
- User-facing documentation wiki
- Accessible at `/docs/`
- Integrated diagram editor (draw.io)

#### Swagger UI (`hosting-control-swagger`)
- API documentation
- Accessible at `/swagger/`
- Serves OpenAPI specification

#### DBGate (`hosting-control-dbgate`)
- Database browser for administrators
- Accessible at `/dbgate/`
- Protected by admin authentication

---

## 3. User Plane Components

The user plane hosts user applications and provides isolated execution environments.

### 3.1 Users Caddy (`hosting-users-caddy`)

**Purpose**: Reverse proxy for user-hosted applications.

**Network Path**:
```
User → knf-hosting.lt:443 → Router:10443 → users-caddy:443
```

**Responsibilities**:
- Route traffic to appropriate virtual servers
- TLS termination for custom domains and `*.knf-hosting.lt` subdomains
- Cloudflare integration support

**Platform Domains**:
- `knf-hosting.lt` - Base domain for user apps (158.129.172.222)
- `*.knf-hosting.lt` - Wildcard subdomain (same IP, no DNS config needed)

**Dynamic Configuration**:
The Caddyfile is dynamically generated based on domain records in the database:

```
# Auto-generated for domain: myapp.knf-hosting.lt
myapp.knf-hosting.lt {
    tls admin@knf.vu.lt
    reverse_proxy hosting-users-dind-{server_id}:80
}
```

---

### 3.2 SSH Router (`hosting-users-ssh-router`)

**Purpose**: Routes SSH connections to appropriate virtual servers.

**Network Path**:
```
User → hosting.knf.vu.lt:22 → Router:10022 → ssh-router:2222
```

**Authentication Flow**:
1. User connects: `ssh server{id}@hosting.knf.vu.lt` (port 22, forwarded to 10022)
2. Router extracts server ID from username
3. Router queries Backend API for authentication
4. Backend validates user's password hash
5. Router establishes connection to virtual server

**API Integration**:
```python
POST /api/sshrouter
{
    "username": "server1",
    "api_key": "{BACKEND_SSH_API_KEY}"
}

Response:
{
    "password_hash": "$2b$12$...",
    "upstream_host": "hosting-users-dind-1",
    "upstream_port": "22",
    "upstream_user": "root",
    "upstream_pass": "root"
}
```

---

### 3.3 Users Firewall (`hosting-users-firewall`)

**Purpose**: Network gateway providing outbound internet access with restrictions.

**Firewall Rules**:
```bash
# Drop traffic to private networks
iptables -A FORWARD -s 172.19.2.0/24 -d 172.16.0.0/12 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 192.168.0.0/16 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 10.0.0.0/8 -j DROP

# Allow outbound internet
iptables -A FORWARD -s 172.19.2.0/24 -j ACCEPT

# NAT for outbound traffic
iptables -t nat -A POSTROUTING -s 172.19.2.0/24 -j MASQUERADE
```

**DNS Service**:
- Runs dnsmasq on 172.19.2.1
- Forwards to 8.8.8.8 and 1.1.1.1

---

### 3.4 DockerHub Cache (`hosting-users-dockerhub-cache`)

**Purpose**: Caching proxy for Docker image pulls.

**Benefits**:
- Reduces bandwidth consumption
- Improves image pull speeds
- Avoids DockerHub rate limits

**Configuration**:
```yaml
REGISTRY_PROXY_REMOTEURL: https://registry-1.docker.io
```

---

### 3.5 Virtual Servers (`hosting-users-dind-{id}`)

**Purpose**: Isolated Docker-in-Docker environments for users.

**Base Image**: Ubuntu Noble with systemd and Docker

**Pre-installed Components**:
| Component | Purpose |
|-----------|---------|
| Docker + Compose | Container orchestration |
| Dockge | Web-based Compose management |
| FileBrowser | Web-based file management |
| Caddy (internal) | Local reverse proxy |

**Filesystem Layout**:
```
/apps/
├── aplikacijos/      # User home directory
│   └── (user files)
└── sistema/          # System services
    ├── docker-compose.yml
    ├── dockge/
    ├── endpoint/
    └── filebrowser/
```

**Initialization Process**:
1. Container starts with systemd
2. `fix-gateway.service` configures networking
3. `init-user-env.service` copies default apps
4. System stack is deployed via docker-compose

---

## 4. Data Flow Patterns

### 4.1 User Login Flow

```
┌────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐
│Browser │────▶│  Caddy  │────▶│ Backend │────▶│ Database │
└────────┘     └─────────┘     └─────────┘     └──────────┘
     │              │               │               │
     │   POST /api/login            │               │
     │──────────────────────────────▶               │
     │              │               │               │
     │              │   Validate    │  Query user   │
     │              │   credentials │───────────────▶
     │              │               │               │
     │              │               │◀──────────────│
     │              │               │  Return hash  │
     │              │               │               │
     │              │    bcrypt     │               │
     │              │    verify     │               │
     │              │               │               │
     │◀─────────────────────────────│               │
     │   Set session cookie         │               │
```

### 4.2 Virtual Server Creation Flow

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌──────────────┐
│Frontend│────▶│ Backend │────▶│  Docker  │────▶│ Docker Host  │
└────────┘     └─────────┘     │Controller│     └──────────────┘
     │              │          └──────────┘           │
     │  POST /api/vm/control   │                      │
     │  action: create         │                      │
     │─────────────────────────▶                      │
     │              │          │                      │
     │              │  Insert  │                      │
     │              │  into DB │                      │
     │              │          │                      │
     │              │──────────▶   docker run         │
     │              │          │   hosting-dind-ubuntu│
     │              │          │──────────────────────▶
     │              │          │                      │
     │              │          │◀─────────────────────│
     │              │◀─────────│   Container created  │
     │◀─────────────│          │                      │
     │  Success     │          │                      │
```

### 4.3 Domain Registration Flow

```
┌────────┐     ┌─────────┐     ┌──────────┐     ┌─────────────┐
│Frontend│────▶│ Backend │────▶│  Docker  │────▶│ users-caddy │
└────────┘     └─────────┘     │Controller│     └─────────────┘
     │              │          └──────────┘           │
     │  POST /api/vm/dns/{id}  │                      │
     │  domainname: app.com    │                      │
     │─────────────────────────▶                      │
     │              │          │                      │
     │         Validate        │                      │
     │         domain          │                      │
     │              │          │                      │
     │         Insert          │                      │
     │         into DB         │                      │
     │              │          │                      │
     │              │──────────▶  Generate            │
     │              │          │  Caddyfile           │
     │              │          │                      │
     │              │          │  Write + Reload      │
     │              │          │──────────────────────▶
     │              │          │                      │
     │◀─────────────│◀─────────│◀─────────────────────│
     │  Success     │          │                      │
```

---

## 5. Component Communication Matrix

| Source | Destination | Protocol | Purpose |
|--------|-------------|----------|---------|
| control-caddy | control-frontend | HTTP | UI serving |
| control-caddy | control-backend | HTTP | API proxying |
| control-frontend | control-backend | HTTP | API calls |
| control-backend | control-docker | HTTP | Container ops |
| control-backend | cadvisor | HTTP | Metrics |
| control-docker | Docker socket | Unix | Docker API |
| control-docker | users-caddy | File | Caddyfile |
| users-caddy | virtual-servers | HTTP | App traffic |
| ssh-router | control-backend | HTTP | Auth lookup |
| ssh-router | virtual-servers | SSH | Terminal |
| virtual-servers | firewall | IP | Internet |
| virtual-servers | dockerhub-cache | HTTP | Image pulls |

---

## 6. Scalability Considerations

### 6.1 Current Limitations

- **Single Host**: All components run on one machine
- **Shared Resources**: No CPU/memory quotas per virtual server
- **Database**: SQLite limits concurrent write operations

### 6.2 Potential Scaling Paths

1. **Horizontal**: Distribute virtual servers across multiple hosts
2. **Database**: Migrate to PostgreSQL for better concurrency
3. **Storage**: Network-attached storage for user data
4. **Load Balancing**: Multiple ingress proxies with shared state

---

## 7. Failure Modes and Recovery

| Component | Failure Impact | Recovery |
|-----------|----------------|----------|
| control-caddy | No web access | Restart container |
| control-backend | API unavailable | Restart container |
| control-docker | No container ops | Restart container |
| users-caddy | User apps inaccessible | Restart container |
| virtual-server | Single user affected | Restart container |
| firewall | No outbound internet | Restart container |
| database | Data inaccessible | Restore from backup |

---

## Next Document

Continue to [02-NETWORK-TOPOLOGY.md](02-NETWORK-TOPOLOGY.md) for detailed network architecture and security controls.

