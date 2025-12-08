# Virtual Server Lifecycle

This document describes the lifecycle of virtual servers, from creation to deletion, including the underlying Docker-in-Docker architecture and management operations.

---

## 1. Virtual Server Concept

### 1.1 What is a Virtual Server?

A virtual server is an isolated Docker-in-Docker environment where users can:
- Deploy Docker containers and Compose stacks
- Run web applications accessible via custom domains
- Access via SSH for terminal operations
- Manage files through a web-based file browser

### 1.2 Technical Implementation

Each virtual server is a Docker container running:
- **Base**: Ubuntu Noble with systemd
- **Runtime**: Sysbox (secure Docker-in-Docker)
- **Services**: Docker daemon, SSH server, management tools

```
┌─────────────────────────────────────────────────────────────────────┐
│                    VIRTUAL SERVER ARCHITECTURE                      │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Container: hosting-users-dind-{id}                           │  │
│  │  Runtime: Sysbox                                              │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │  Ubuntu Noble + Systemd                                 │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │  │  │
│  │  │  │ Docker  │  │   SSH   │  │ System  │                  │  │  │
│  │  │  │ Daemon  │  │ Server  │  │Services │                  │  │  │
│  │  │  └────┬────┘  └─────────┘  └─────────┘                  │  │  │
│  │  │       │                                                 │  │  │
│  │  │  ┌────▼──────────────────────────────────────────────┐  │  │  │
│  │  │  │  User Containers (Docker Compose Stacks)          │  │  │  │
│  │  │  │                                                   │  │  │  │
│  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │  │  │
│  │  │  │  │ Dockge   │  │FileBrowser│ │ Endpoint │         │  │  │  │
│  │  │  │  │ (UI)     │  │ (Files)  │  │ (Caddy)  │         │  │  │  │
│  │  │  │  └──────────┘  └──────────┘  └──────────┘         │  │  │  │
│  │  │  │                                                   │  │  │  │
│  │  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │  │  │  │
│  │  │  │  │ User     │  │ User     │  │ User     │         │  │  │  │
│  │  │  │  │ App 1    │  │ App 2    │  │ App N    │         │  │  │  │
│  │  │  │  └──────────┘  └──────────┘  └──────────┘         │  │  │  │
│  │  │  └───────────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Volumes:                                                           │
│  • /apps → SERVERS/{id}/apps (persistent user data)                 │
│  • /var/lib/docker → SERVERS/{id}/docker (Docker storage)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Lifecycle States

### 2.1 State Diagram

```
              ┌───────────┐
              │  CREATE   │
              └─────┬─────┘
                    │
                    ▼
              ┌───────────┐
       ┌──────│  RUNNING  │◀─────┐
       │      └─────┬─────┘      │
       │            │            │
       │ STOP       │ START      │
       │            │            │
       ▼            ▼            │
  ┌───────────┐           ┌───────────┐
  │  STOPPED  │───────────│  STOPPED  │
  └─────┬─────┘           └───────────┘
        │
        │ DELETE
        │
        ▼
  ┌───────────┐
  │  DELETED  │ (soft delete, data archived)
  └───────────┘
```

### 2.2 State Definitions

| State | Container Status | Database `Enabled` | User Access |
|-------|-----------------|-------------------|-------------|
| Running | `running` | 1 | Full access |
| Stopped | `exited` | 0 | No access |
| Deleted | Removed | N/A (`Deleted=1`) | No access |

---

## 3. Creation Process

### 3.1 API Endpoint

**Endpoint**: `POST /api/vm/control`

**Request**:
```json
{
    "action": "create",
    "name": "My Application Server"
}
```

### 3.2 Creation Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     VIRTUAL SERVER CREATION                         │
│                                                                     │
│  1. Frontend Request                                                │
│     │                                                               │
│     │ POST /api/vm/control { action: "create", name: "..." }        │
│     │                                                               │
│     ▼                                                               │
│  2. Backend Validation                                              │
│     │                                                               │
│     │ • Name length: 3-30 characters                                │
│     │ • Allowed characters: letters, numbers, spaces, underscores   │
│     │                                                               │
│     ▼                                                               │
│  3. Database Insert                                                 │
│     │                                                               │
│     │ INSERT INTO Hosting_VirtualServers (OwnerID, Name, ...)       │
│     │ → Returns new ID (e.g., 42)                                   │
│     │                                                               │
│     ▼                                                               │
│  4. Docker Controller Request                                       │
│     │                                                               │
│     │ GET /api/create/hosting-users-dind-42                         │
│     │                                                               │
│     ▼                                                               │
│  5. Container Creation                                              │
│     │                                                               │
│     │ docker run -d                                                 │
│     │   --name hosting-users-dind-42                                │
│     │   --hostname server42                                         │
│     │   --runtime=sysbox-runc                                       │
│     │   -v ${ROOT}/SERVERS/42/apps:/apps                            │
│     │   -v ${ROOT}/SERVERS/42/docker:/var/lib/docker                │
│     │   --net filtered-users                                        │
│     │   hosting-dind-ubuntu                                         │
│     │                                                               │
│     ▼                                                               │
│  6. Container Initialization                                        │
│     │                                                               │
│     │ • systemd starts                                              │
│     │ • fix-gateway.service configures networking                   │
│     │ • init-user-env.service copies default apps                   │
│     │ • Docker daemon starts                                        │
│     │ • System stack deploys                                        │
│     │                                                               │
│     ▼                                                               │
│  7. Ready for Use                                                   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Name Validation

```python
LITHUANIAN_CHARS = 'aąbcčdeęėfghiįyjklmnopqrsštuųūvwxyzž0123456789_ '

def validate_name(name):
    if len(name) < 3:
        return False, "Name must be at least 3 characters"
    if len(name) > 30:
        return False, "Name must be less than 30 characters"
    for char in name:
        if char.lower() not in LITHUANIAN_CHARS:
            return False, "Invalid characters in name"
    return True, None
```

### 3.4 Directory Structure Created

```
SERVERS/
└── {id}/
    ├── apps/                    # Persistent user data
    │   ├── aplikacijos/         # User home directory
    │   │   └── (user files)
    │   └── sistema/             # System services
    │       ├── docker-compose.yml
    │       ├── dockge/
    │       ├── endpoint/
    │       └── filebrowser/
    └── docker/                  # Docker storage
        └── (Docker internal data)
```

---

## 4. Start/Stop Operations

### 4.1 Start Virtual Server

**Endpoint**: `POST /api/vm/control`

**Request**:
```json
{
    "action": "start",
    "virtualServerID": "42"
}
```

**Process**:
1. Verify user owns the virtual server
2. Execute: `docker start hosting-users-dind-42`
3. Update database: `Enabled = 1`
4. Log activity

### 4.2 Stop Virtual Server

**Endpoint**: `POST /api/vm/control`

**Request**:
```json
{
    "action": "stop",
    "virtualServerID": "42"
}
```

**Process**:
1. Verify user owns the virtual server
2. Execute: `docker stop hosting-users-dind-42`
3. Update database: `Enabled = 0`
4. Log activity

### 4.3 State Persistence

When a virtual server is stopped:
- Docker container state is preserved
- User data in `/apps` persists
- Docker images/containers inside persist
- Network configuration persists

---

## 5. Deletion Process

### 5.1 Delete Virtual Server

**Endpoint**: `POST /api/vm/control`

**Request**:
```json
{
    "action": "delete",
    "virtualServerID": "42"
}
```

### 5.2 Deletion Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                     VIRTUAL SERVER DELETION                         │
│                                                                     │
│  1. Ownership Verification                                          │
│     │                                                               │
│     │ Check: user.id == vm.owner_id OR user.admin == 1              │
│     │                                                               │
│     ▼                                                               │
│  2. Stop Container                                                  │
│     │                                                               │
│     │ docker stop hosting-users-dind-42                             │
│     │                                                               │
│     ▼                                                               │
│  3. Remove Container                                                │
│     │                                                               │
│     │ docker rm hosting-users-dind-42                               │
│     │                                                               │
│     ▼                                                               │
│  4. Archive Docker Data                                             │
│     │                                                               │
│     │ rm -rf SERVERS/42/docker                                      │
│     │                                                               │
│     ▼                                                               │
│  5. Archive User Data                                               │
│     │                                                               │
│     │ mv SERVERS/42 SERVERS/42-deleted-20251208120000               │
│     │                                                               │
│     ▼                                                               │
│  6. Database Updates                                                │
│     │                                                               │
│     │ UPDATE Hosting_VirtualServers SET Deleted = 1                 │
│     │ DELETE FROM Hosting_DockerContainers WHERE ParentServerID=42  │
│     │ DELETE FROM Hosting_DomainNames WHERE VirtualServerID=42      │
│     │                                                               │
│     ▼                                                               │
│  7. Deletion Complete                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Data Retention

- **User data**: Archived (renamed with timestamp)
- **Docker data**: Deleted (too large to archive)
- **Database records**: Soft deleted (`Deleted = 1`)
- **Domain associations**: Hard deleted

---

## 6. Rename Operation

### 6.1 Rename Virtual Server

**Endpoint**: `POST /api/vm/control`

**Request**:
```json
{
    "action": "rename",
    "virtualServerID": "42",
    "newName": "New Server Name"
}
```

**Process**:
1. Verify ownership
2. Validate new name
3. Update database
4. Log activity

---

## 7. System Stack

### 7.1 Default Services

Each virtual server includes pre-configured services (all accessed through the endpoint):

| Service | Internal Port | URL Path | Purpose |
|---------|---------------|----------|---------|
| **Endpoint** | 10080 | `/` | Caddy reverse proxy (entry point) |
| **Dockge** | 5001 | `/` (default) | Docker Compose management UI |
| **FileBrowser** | 80 | `/filebrowser/*` | Web-based file manager |
| **WebSSH2** | 2222 | `/ssh/*` | Web-based SSH terminal |
| **Docker Socket** | - | `/dockersocket/*` | Docker API access |

### 7.2 Docker Compose Configuration

```yaml
# /apps/sistema/docker-compose.yml
services:
  sistema-endpoint:
    container_name: sistema-endpoint
    image: caddy:2.10-alpine
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./endpoint/Caddyfile:/etc/caddy/Caddyfile:ro
    ports:
      - 10080:80    # External access point
    networks:
      - external
      - isolated
    restart: unless-stopped

  sistema-dockge:
    container_name: sistema-dockge
    image: louislam/dockge:1.5.0
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./dockge/data:/app/data
      - /apps/aplikacijos:/apps/aplikacijos
    environment:
      - DOCKGE_STACKS_DIR=/apps/aplikacijos
      - DOCKGE_ENABLE_CONSOLE=true
    networks:
      - isolated
    restart: unless-stopped

  sistema-filebrowser:
    container_name: sistema-filebrowser
    build: ./filebrowser
    volumes:
      - /apps/aplikacijos:/data
    networks:
      - isolated
    restart: unless-stopped

  sistema-webssh2:
    container_name: sistema-webssh2
    image: billchurch/webssh2:2.3.5
    networks:
      - external
    restart: unless-stopped

networks:
  external:
    external: true
  isolated:
    name: sistema-isolated
    driver: bridge
    internal: true
```

### 7.3 Internal Routing

The `sistema-endpoint` Caddy container acts as the reverse proxy, routing all traffic:

```
# /apps/sistema/endpoint/Caddyfile
:80 {
    # Security: Block non-system IPs (only control plane can access)
    @non_system_ips {
        not {
            remote_ip 172.19.2.2/32   # hosting-control-caddy
            remote_ip 172.19.2.11/32  # hosting-control-dockersocket
        }
    }
    respond @non_system_ips "Access denied" 403

    # Docker Socket API proxy
    handle_path /dockersocket/* {
        reverse_proxy unix//var/run/docker.sock
    }
    
    # FileBrowser
    handle /filebrowser* {
        reverse_proxy sistema-filebrowser:80
    }

    # WebSSH2 terminal
    # Auto-login using Base64-encoded "root:root" credentials
    # (cm9vdDpyb290 = base64("root:root"))
    handle /ssh/* {
        reverse_proxy sistema-webssh2:2222 {
            header_up Authorization "Basic cm9vdDpyb290"
        }
    }

    # Dockge (default handler)
    handle {
        reverse_proxy sistema-dockge:5001
    }
}
```

### 7.4 Access Flow

External access to VM management goes through this chain:

```
User Browser
     │
     │ https://{domain}:8443/
     ▼
hosting-control-caddy (port 8443)
     │
     │ forward_auth → /api/checkauth/vm/{cookie.virtual-server-id}
     │
     ▼
hosting-users-dind-{id}:10080 (sistema-endpoint)
     │
     ├── /            → sistema-dockge:5001 (Compose UI)
     ├── /filebrowser → sistema-filebrowser:80 (File Manager)
     ├── /ssh/*       → sistema-webssh2:2222 (Web Terminal)
     └── /dockersocket/* → Docker API
```

---

## 8. Container Monitoring

### 8.1 Background Monitor

The backend runs a background thread that:
1. Polls container status every 3 seconds
2. Updates `Hosting_DockerContainers` table
3. Tracks containers inside each virtual server

### 8.2 Monitored Data

| Field | Description |
|-------|-------------|
| DockerID | Container ID |
| ParentServerID | Virtual server ID (0 for host) |
| Image | Docker image name |
| State | running, exited, paused |
| Status | Human-readable status |
| Names | Container name |
| Ports | Port mappings |
| Labels | Docker labels |

### 8.3 Database Schema

```sql
CREATE TABLE Hosting_DockerContainers (
    DockerID TEXT NOT NULL,
    ParentServerID INTEGER NOT NULL,
    Command TEXT,
    CreatedAt TEXT,
    Image TEXT,
    Labels TEXT,
    Mounts TEXT,
    Names TEXT,
    Networks TEXT,
    Ports TEXT,
    RunningFor TEXT,
    Size TEXT,
    State TEXT,
    Status TEXT,
    UpdatedAt TEXT,
    UNIQUE(DockerID, ParentServerID)
);
```

---

## 9. Resource Management

### 9.1 Storage

| Path | Purpose | Size Limit |
|------|---------|------------|
| `/apps` | User files | No limit |
| `/var/lib/docker` | Docker data | No limit |

### 9.2 Cleanup Operation

**Endpoint**: `GET /api/cleanup/{container_name}` (Docker Controller)

Removes unused Docker resources:
```bash
docker exec {container} docker system prune -a -f --volumes
```

### 9.3 No Resource Quotas

Currently, virtual servers have no CPU/memory limits. This is a known limitation for shared hosting environments.

---

## 10. Access Methods

### 10.1 Web Access

| URL Path | Purpose |
|----------|---------|
| `https://{domain}:8443/` | Dockge (Docker Compose UI) - default |
| `https://{domain}:8443/filebrowser/` | FileBrowser (file manager) |
| `https://{domain}:8443/ssh/` | WebSSH2 (web terminal) |
| `https://{domain}:8443/dockersocket/` | Docker API (internal use) |

**Requirements**:
- Valid session cookie
- `virtual-server-id` cookie set

### 10.2 SSH Access

```bash
ssh server{id}@hosting.knf.vu.lt
```

**Authentication**: Platform user password

> **Note**: External port 22 is forwarded by the router to internal port 10022.

### 10.3 Custom Domain Access

User applications are accessible via custom domains configured through the DNS management system.

---

## 11. Troubleshooting

### 11.1 Container Won't Start

**Check**:
```bash
# View container logs
docker logs hosting-users-dind-{id}

# Check systemd status inside
docker exec hosting-users-dind-{id} systemctl status

# Verify Docker inside is working
docker exec hosting-users-dind-{id} docker info
```

### 11.2 Network Issues

**Check**:
```bash
# Verify container is on correct network
docker inspect hosting-users-dind-{id} --format='{{json .NetworkSettings.Networks}}'

# Test DNS resolution
docker exec hosting-users-dind-{id} nslookup google.com

# Test internet connectivity
docker exec hosting-users-dind-{id} curl -I https://google.com
```

### 11.3 Storage Issues

**Check**:
```bash
# View disk usage
docker exec hosting-users-dind-{id} df -h

# Check Docker disk usage
docker exec hosting-users-dind-{id} docker system df
```

---

## Next Document

Continue to [05-DNS-MANAGEMENT.md](05-DNS-MANAGEMENT.md) for domain name and DNS configuration.

