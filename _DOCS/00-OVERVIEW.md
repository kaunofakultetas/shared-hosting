# App Hosting Platform - Technical Documentation

## Table of Contents

| Document | Description |
|----------|-------------|
| [00-OVERVIEW.md](00-OVERVIEW.md) | High-level system overview (this document) |
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Detailed architecture and components |
| [02-NETWORK-TOPOLOGY.md](02-NETWORK-TOPOLOGY.md) | Network design, isolation, and security |
| [03-AUTHENTICATION.md](03-AUTHENTICATION.md) | Authentication and authorization flows |
| [04-VIRTUAL-SERVERS.md](04-VIRTUAL-SERVERS.md) | Virtual server lifecycle management |
| [05-DNS-MANAGEMENT.md](05-DNS-MANAGEMENT.md) | DNS and reverse proxy configuration |
| [06-DATABASE-SCHEMA.md](06-DATABASE-SCHEMA.md) | Database structure and relationships |
| [07-SECURITY.md](07-SECURITY.md) | Security considerations and hardening |
| [INSTALLATION.md](INSTALLATION.md) | Installation and deployment guide |

---

## 1. Executive Summary

The **App Hosting Platform** is a multi-tenant container hosting system designed for educational environments. It enables students to deploy and manage Docker-based applications in isolated virtual servers, with each user receiving a dedicated Docker-in-Docker (DinD) environment.

### Key Capabilities

- **Multi-tenant Isolation**: Each user operates within a dedicated containerized environment
- **Container Orchestration**: Users can deploy Docker Compose stacks via web interface
- **Custom Domain Support**: Automatic SSL/TLS certificate provisioning with Let's Encrypt
- **SSH Access**: Direct terminal access to virtual servers
- **Administrative Control**: Centralized management of users, servers, and resources

---

## 2. System Overview

### 2.1 Problem Statement

Educational institutions require a platform where students can:
1. Deploy web applications without managing physical infrastructure
2. Learn containerization and DevOps practices in a safe environment
3. Access their applications via custom domain names
4. Have isolated environments that prevent cross-tenant interference

### 2.2 Solution Architecture

The platform employs a **nested containerization** approach using Sysbox runtime, allowing each user to run Docker inside Docker with full isolation. This provides:

- **Security**: Complete process and filesystem isolation between tenants
- **Flexibility**: Users can run any Docker workload
- **Simplicity**: Single-host deployment with container-level isolation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           HOST SYSTEM                                   │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    CONTROL PLANE                                   │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐               │ │
│  │  │ Caddy   │  │Frontend │  │ Backend │  │ Docker   │               │ │
│  │  │ (Proxy) │  │ (Next)  │  │ (Flask) │  │Controller│               │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └──────────┘               │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                     USER PLANE                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ Virtual      │  │ Virtual      │  │ Virtual      │              │ │
│  │  │ Server #1    │  │ Server #2    │  │ Server #N    │              │ │
│  │  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │              │ │
│  │  │ │ Docker   │ │  │ │ Docker   │ │  │ │ Docker   │ │              │ │
│  │  │ │ Engine   │ │  │ │ Engine   │ │  │ │ Engine   │ │              │ │
│  │  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Core Components

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Reverse Proxy** | Caddy 2.x | TLS termination, routing, geo-blocking |
| **Frontend** | Next.js 15 | Admin and user web interface |
| **Backend API** | Flask/Python | REST API, business logic |
| **Docker Controller** | Flask/Python | Container lifecycle management |
| **Database** | SQLite | User, server, and domain storage |
| **Virtual Servers** | Ubuntu + Sysbox | Isolated Docker-in-Docker environments |
| **SSH Router** | Custom Go | Dynamic SSH routing to virtual servers |

---

## 3. Traffic Flow Overview

### 3.1 Public DNS and IP Addresses

The platform uses **two public IP addresses** with separate DNS records:

| IP Address | Domain | Purpose |
|------------|--------|---------|
| 158.129.172.221 | `hosting.knf.vu.lt` | Control panel, SSH |
| 158.129.172.222 | `knf-hosting.lt` | User applications |
| 158.129.172.222 | `*.knf-hosting.lt` | User subdomains (wildcard) |

### 3.2 Inbound Traffic Endpoints

Traffic is port-forwarded from the public IPs through a router to the Docker host:

**Control IP (hosting.knf.vu.lt)**:
| External Port | Internal Port | Protocol | Purpose |
|---------------|---------------|----------|---------|
| 22 | 10022 | SSH | Terminal access |
| 80 | 80 | HTTP | Redirect to HTTPS |
| 443 | 443 | HTTPS | Control panel |
| 8443 | 8443 | HTTPS | VM management panels |

**User Apps IP (knf-hosting.lt)**:
| External Port | Internal Port | Protocol | Purpose |
|---------------|---------------|----------|---------|
| 80 | 10080 | HTTP | User applications |
| 443 | 10443 | HTTPS | User applications (SSL) |

### 3.3 Request Flow Diagram

```
                                    ┌─────────────────┐
                                    │    INTERNET     │
                                    └────────┬────────┘
                                             │
     ┌───────────────────────────────────────┼───────────────────────────────────────┐
     │                                       │                                       │
     ▼                                       ▼                                       ▼
┌─────────────────────┐          ┌─────────────────────┐          ┌─────────────────────┐
│ hosting.knf.vu.lt   │          │ *.knf-hosting.lt    │          │ hosting.knf.vu.lt   │
│ :443                │          │ :443                │          │ :22                 │
│ (Control Panel)     │          │ (User Apps)         │          │ (SSH)               │
└──────────┬──────────┘          └──────────┬──────────┘          └──────────┬──────────┘
           │                                │                                │
           │ Router: 443→443                │ Router: 443→10443              │ Router: 22→10022
           ▼                                ▼                                ▼
     ┌────────────────┐           ┌────────────────┐            ┌────────────────┐
     │ control-caddy  │           │  users-caddy   │            │  ssh-router    │
     │ :443           │           │  :443          │            │  :2222         │
     └───────┬────────┘           └───────┬────────┘            └───────┬────────┘
             │                            │                             │
             ▼                            ▼                             ▼
     ┌────────────────┐           ┌────────────────┐            ┌────────────────┐
     │   Frontend /   │           │  Virtual       │            │  Virtual       │
     │   Backend API  │           │  Server #N     │            │  Server #N     │
     └────────────────┘           └────────────────┘            └────────────────┘
```

---

## 4. User Roles and Permissions

### 4.1 Role Hierarchy

| Role | Capabilities |
|------|--------------|
| **Administrator** | Full system access, user management, all virtual servers |
| **User** | Own virtual servers, domain management, application deployment |

### 4.2 Permission Matrix

| Action | Admin | User |
|--------|:-----:|:----:|
| Create virtual server | ✓ | ✓ |
| Start/Stop own server | ✓ | ✓ |
| Delete own server | ✓ | ✓ |
| Manage own domains | ✓ | ✓ |
| View all servers | ✓ | ✗ |
| Manage all users | ✓ | ✗ |
| View system dashboard | ✓ | ✗ |
| Generate registration codes | ✓ | ✗ |

---

## 5. Technology Stack

### 5.1 Infrastructure Layer

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Container Runtime | Docker + Sysbox | Latest | Nested container support |
| Reverse Proxy | Caddy | 2.10 | TLS, routing, authentication |
| DNS/Firewall | iptables + dnsmasq | - | Network isolation |

### 5.2 Application Layer

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Frontend | Next.js | 15.x | React-based web UI |
| Backend API | Flask | 3.x | REST API server |
| Database | SQLite | 3.x | Persistent storage |
| Documentation | BookStack | 25.x | User documentation wiki |
| API Docs | Swagger UI | 5.x | OpenAPI documentation |

### 5.3 User Environment

| Component | Technology | Purpose |
|-----------|------------|---------|
| Base Image | Ubuntu Noble | User virtual server OS |
| Container Engine | Docker + Compose | Application deployment |
| File Manager | FileBrowser | Web-based file management |
| Container UI | Dockge | Docker Compose management |

---

## 6. Deployment Model

### 6.1 Single-Host Architecture

The entire platform runs on a single Docker host, leveraging:

- **Sysbox Runtime**: Enables secure Docker-in-Docker without privileged containers
- **Network Isolation**: Multiple Docker networks with strict firewall rules
- **Persistent Storage**: Volume mounts for user data and system state

### 6.2 Resource Allocation

| Resource | Allocation Strategy |
|----------|---------------------|
| CPU | Shared among all containers (no hard limits) |
| Memory | Shared among all containers (no hard limits) |
| Storage | Per-user volume in `SERVERS/{id}/` directory |
| Network | Dedicated IP per virtual server in filtered subnet |

---

## 7. Quick Reference

### 7.1 Default Credentials

| Service | Username | Password | Notes |
|---------|----------|----------|-------|
| Admin Panel | admin@admin.com | admin | **Change immediately** |
| Virtual Server SSH | server{id} | (user's password) | Uses user account password |

### 7.2 Important Paths

| Path | Purpose |
|------|---------|
| `/home/aula/apps/students/` | Installation root |
| `_DATA/` | Persistent data (databases, certs, caches) |
| `SERVERS/{id}/` | User virtual server data |
| `control-modules/` | Control plane source code |
| `users-modules/` | User plane components |

### 7.3 Service URLs

**Control Panel URLs** (via `hosting.knf.vu.lt`):

| URL | Purpose |
|-----|---------|
| `https://hosting.knf.vu.lt/` | User/Admin web interface |
| `https://hosting.knf.vu.lt/docs/` | User documentation (BookStack) |
| `https://hosting.knf.vu.lt/swagger/` | API documentation |
| `https://hosting.knf.vu.lt/dbgate/` | Database browser (Admin only) |
| `https://hosting.knf.vu.lt:8443/` | Virtual server management panels |
| `ssh server{id}@hosting.knf.vu.lt` | SSH access to virtual servers (port 22) |

**User Application URLs** (via `knf-hosting.lt`):

| URL | Purpose |
|-----|---------|
| `https://myapp.knf-hosting.lt/` | User-hosted web application |
| `https://*.knf-hosting.lt/` | Any subdomain → user apps |
| `https://custom-domain.com/` | Custom domain (configured in DNS settings) |

---

## 8. Document Conventions

Throughout this documentation:

- **Control Domain**: `hosting.knf.vu.lt` (admin panel, SSH)
- **User Apps Domain**: `knf-hosting.lt` and `*.knf-hosting.lt` (user applications)
- `{id}` refers to a virtual server ID (integer)
- Code blocks with `$` prefix indicate shell commands
- Architecture diagrams use ASCII art for portability

---

## 9. Further Reading

- [01-ARCHITECTURE.md](01-ARCHITECTURE.md) - Detailed component descriptions
- [02-NETWORK-TOPOLOGY.md](02-NETWORK-TOPOLOGY.md) - Network security design
- [07-SECURITY.md](07-SECURITY.md) - Security hardening guide
- [INSTALLATION.md](INSTALLATION.md) - Deployment instructions

