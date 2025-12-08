# DNS and Domain Management

This document describes the domain name system, SSL/TLS certificate management, and reverse proxy configuration for user applications.

---

## 1. Domain System Overview

### 1.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DOMAIN ROUTING ARCHITECTURE                    │
│                                                                     │
│  Internet                                                           │
│     │                                                               │
│     │  DNS: myapp.knf-hosting.lt → 158.129.172.222                  │
│     │  HTTPS (:443) → Router → Host :10443                          │
│     │                                                               │
│     ▼                                                               │
│  ┌─────────────────────────────────────────┐                        │
│  │  hosting-users-caddy (HTTPS)            │                        │
│  │                                         │                        │
│  │  ┌───────────────────────────────────┐  │                        │
│  │  │  Dynamic Caddyfile                │  │                        │
│  │  │                                   │  │                        │
│  │  │  myapp.example.com {              │  │                        │
│  │  │    tls {                          │  │                        │
│  │  │      ...                          │  │                        │
│  │  │    }                              │  │                        │
│  │  │    reverse_proxy dind-1:80        │  │                        │
│  │  │  }                                │  │                        │
│  │  │                                   │  │                        │
│  │  │  other.example.com {              │  │                        │
│  │  │    reverse_proxy dind-2:80        │  │                        │
│  │  │  }                                │  │                        │
│  │  └───────────────────────────────────┘  │                        │
│  └─────────────────────────────────────────┘                        │
│                   │                                                 │
│                   │ Route by hostname                               │
│                   │                                                 │
│     ┌─────────────┼─────────────┐                                   │
│     │             │             │                                   │
│     ▼             ▼             ▼                                   │
│  ┌─────┐      ┌─────┐      ┌─────┐                                  │
│  │VM #1│      │VM #2│      │VM #N│                                  │
│  └─────┘      └─────┘      └─────┘                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Domain Types

| Type | Example | TLS Certificate |
|------|---------|-----------------|
| Standard | `myapp.example.com` | Let's Encrypt |
| Cloudflare-proxied | `myapp.example.com` | Cloudflare Origin |
| No SSL | `myapp.example.com` | None (HTTP only) |

---

## 2. Domain Validation

### 2.1 Validation Rules

Before a domain can be added, it must pass validation:

| Rule | Requirement |
|------|-------------|
| Minimum length | 5 characters |
| Maximum length | 39 characters |
| Structure | At least one dot (`.`) |
| No repeated dots | `..` is not allowed |
| Allowed characters | `a-z`, `0-9`, `-`, `_`, `.` |
| Start/End | Must start and end with letters |
| Uniqueness | Not used by another virtual server |

### 2.2 Validation Implementation

```python
def is_domain_valid(virtual_server_id, domainname):
    # Length checks
    if len(domainname) < 5:
        return False, 'Domain name must be at least 5 characters long'
    if len(domainname) >= 40:
        return False, 'Domain name is too long'
    
    # Structure checks
    if len(domainname.split('.')) <= 1:
        return False, 'Domain name must consist at least one dot'
    if domainname.count('..') > 0:
        return False, 'Domain name cannot consist of repeated dots'
    
    # Character validation
    if not re.match(r'^[a-zA-Z0-9-_.]+$', domainname):
        return False, 'Invalid characters in domain name'
    
    # Start/end validation
    if not domainname[0].isalpha() or not domainname[-1].isalpha():
        return False, 'Domain name must start and end with characters (a-z)'
    
    # Uniqueness check
    count = db.execute(
        'SELECT COUNT(*) FROM Hosting_DomainNames '
        'WHERE VirtualServerID <> ? AND DomainName = ?',
        [virtual_server_id, domainname]
    ).fetchone()[0]
    
    if count > 0:
        return False, 'Domain name is already taken'
    
    return True, 'Domain name is valid'
```

### 2.3 Validation API

**Endpoint**: `GET /api/vm/dns/isvalid`

**Parameters**:
- `domainname`: Domain to validate (URL encoded)
- `virtualserverid`: Virtual server ID

**Response**:
```json
{
    "isvalid": true,
    "error_message": "Domain name is valid"
}
```

---

## 3. Domain CRUD Operations

### 3.1 List Domains

**Endpoint**: `GET /api/vm/dns/{virtualServerID}`

**Response**:
```json
[
    {
        "id": 1,
        "virtualserverid": 42,
        "domainname": "myapp.example.com",
        "iscloudflare": 0,
        "ssl": 1
    },
    {
        "id": 2,
        "virtualserverid": 42,
        "domainname": "api.example.com",
        "iscloudflare": 1,
        "ssl": 1
    }
]
```

### 3.2 Add Domain

**Endpoint**: `POST /api/vm/dns/{virtualServerID}`

**Request**:
```json
{
    "domainname": "newapp.example.com",
    "iscloudflare": 0,
    "ssl": 1
}
```

**Process**:
1. Validate domain name
2. Insert into database
3. Regenerate Caddyfile
4. Reload Caddy configuration

### 3.3 Update Domain

**Endpoint**: `PUT /api/vm/dns/{virtualServerID}`

**Request**:
```json
{
    "domainid": 1,
    "domainname": "updated.example.com",
    "iscloudflare": 0,
    "ssl": 1
}
```

### 3.4 Delete Domain

**Endpoint**: `DELETE /api/vm/dns/{virtualServerID}/{domainID}`

---

## 4. TLS Certificate Management

### 4.1 Certificate Types

| SSL Setting | Cloudflare | Certificate Source |
|-------------|------------|-------------------|
| `ssl: 1` | `iscloudflare: 0` | Let's Encrypt (automatic) |
| `ssl: 1` | `iscloudflare: 1` | Cloudflare Origin |
| `ssl: 0` | N/A | No certificate (HTTP only) |

### 4.2 Let's Encrypt Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                  LET'S ENCRYPT CERTIFICATE FLOW                     │
│                                                                     │
│  1. User adds domain: myapp.example.com                             │
│     │                                                               │
│     ▼                                                               │
│  2. Caddyfile updated with new domain                               │
│     │                                                               │
│     │  myapp.example.com {                                          │
│     │    tls {email}  # Triggers ACME                               │
│     │    reverse_proxy hosting-users-dind-42:80                     │
│     │  }                                                            │
│     │                                                               │
│     ▼                                                               │
│  3. Caddy requests certificate from Let's Encrypt                   │
│     │                                                               │
│     │  ACME HTTP-01 Challenge                                       │
│     │  /.well-known/acme-challenge/{token}                          │
│     │                                                               │
│     ▼                                                               │
│  4. Certificate issued and stored                                   │
│     │                                                               │
│     │  /data/caddy/certificates/...                                 │
│     │                                                               │
│     ▼                                                               │
│  5. HTTPS traffic now works                                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Cloudflare Configuration

When using Cloudflare proxy, the system uses `tls internal` (self-signed certificate) because Cloudflare handles the public-facing TLS:

```
myapp.example.com {
    tls internal
    
    # Block non-Cloudflare requests
    @block_non_cloudflare {
        not {
            import cloudflare
        }
    }
    respond @block_non_cloudflare "Sorry for disapointing you, but this service is only accessible through Cloudflare" 403
    
    reverse_proxy http://hosting-users-dind-42:80 {
        header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
    }
}
```

**How it works**:
- Cloudflare terminates public TLS and connects to origin using the internal certificate
- Only requests from Cloudflare IP ranges are allowed (non-Cloudflare IPs get 403)
- The `X-Forwarded-For` header preserves the original client IP

**Requirements**:
- Domain DNS managed by Cloudflare
- Cloudflare proxy enabled (orange cloud)
- Cloudflare SSL mode set to "Full" or "Full (Strict)"

---

## 5. Caddyfile Generation

### 5.1 Caddyfile Updater Module

The `CaddyfileUpdater` class generates Caddyfile configurations dynamically:

```python
class CaddyfileUpdater:
    def generate_caddyfile(self, dns_entries):
        caddyfile_content = ""
        caddyfile_content += self.global_options + "\n\n"
        caddyfile_content += self.cloudflare_snippet + "\n\n"  # Cloudflare IP ranges
        
        for dns_entry in dns_entries:
            domain_name = dns_entry["domainname"]
            virtual_server_id = dns_entry["virtualserverid"]
            is_cloudflare = dns_entry["iscloudflare"]
            is_ssl = dns_entry["ssl"]
            
            # Domain block header (with or without SSL)
            if is_ssl == 1:
                server_block = f"{domain_name} {{\n"
            else:
                server_block = f"http://{domain_name} {{\n"
            
            # TLS configuration
            if is_cloudflare == 1:
                server_block += "    tls internal\n\n"
                # Add Cloudflare IP restriction
                server_block += self.cloudflare_block + "\n\n"
            elif is_ssl == 1:
                server_block += "    tls admin@knf.vu.lt\n\n"
            
            # Reverse proxy with appropriate headers
            server_block += f"    reverse_proxy http://hosting-users-dind-{virtual_server_id}:80 {{\n"
            if is_cloudflare == 1:
                server_block += "        header_up X-Forwarded-For {http.request.header.X-Forwarded-For}\n"
            else:
                server_block += "        header_up X-Forwarded-For {remote_host}\n"
            server_block += "    }\n"
            
            # Error handling
            server_block += "    handle_errors 502 {\n"
            server_block += '        respond "Virtual server does not host any app on port 80 or the app cannot be accessed externally." 502\n'
            server_block += "    }\n"
            server_block += "}\n\n"
            
            caddyfile_content += server_block
        
        return caddyfile_content
    
    def save_caddyfile(self, caddyfile_content):
        with open('/users-caddy/Caddyfile', 'w') as f:
            f.write(caddyfile_content)
    
    def reload_caddy(self):
        # Execute docker command to reload Caddy
        process = Popen([
            'docker', 'exec', 'hosting-users-caddy', 
            'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'
        ])
        process.communicate()
```

### 5.2 Generated Caddyfile Example

```
# Auto-generated Caddyfile for user applications

# Cloudflare IP ranges snippet
(cloudflare) {
    remote_ip 103.21.244.0/22
    remote_ip 104.16.0.0/13
    # ... more Cloudflare IPs
}

# DNS ID: 1
myapp.example.com {
    tls admin@knf.vu.lt

    reverse_proxy http://hosting-users-dind-1:80 {
        header_up X-Forwarded-For {remote_host}
    }
    handle_errors 502 {
        respond "Virtual server does not host any app on port 80 or the app cannot be accessed externally." 502
    }
}

# DNS ID: 2 (Cloudflare-proxied)
api.company.com {
    tls internal

    # Block Non cloudflare requests
    @block_non_cloudflare {
        not { import cloudflare }
    }
    respond @block_non_cloudflare "Sorry for disapointing you, but this service is only accessible through Cloudflare" 403

    reverse_proxy http://hosting-users-dind-2:80 {
        header_up X-Forwarded-For {http.request.header.X-Forwarded-For}
    }
    handle_errors 502 {
        respond "Virtual server does not host any app on port 80 or the app cannot be accessed externally." 502
    }
}

# DNS ID: 3 (HTTP only, no SSL)
http://demo.project.org {
    reverse_proxy http://hosting-users-dind-3:80 {
        header_up X-Forwarded-For {remote_host}
    }
    handle_errors 502 {
        respond "Virtual server does not host any app on port 80 or the app cannot be accessed externally." 502
    }
}

:80 {
    respond "Hosting platform does not host any applications at this domain name." 200
}
```

---

## 6. DNS Requirements

### 6.1 Platform Domain Architecture

The platform uses two separate public IP addresses and domains:

| Domain | IP Address | Purpose |
|--------|------------|---------|
| `hosting.knf.vu.lt` | 158.129.172.221 | Control panel, SSH |
| `knf-hosting.lt` | 158.129.172.222 | User applications |
| `*.knf-hosting.lt` | 158.129.172.222 | Wildcard for user subdomains |

### 6.2 Using Platform Subdomains

The easiest way for users to expose applications is using the platform's wildcard domain:

1. User configures a subdomain like `myapp.knf-hosting.lt`
2. No external DNS configuration needed (wildcard resolves automatically)
3. Platform issues Let's Encrypt certificate
4. Application becomes accessible immediately

**Example**:
```
# Add domain in the platform
Domain: myapp.knf-hosting.lt
SSL: Enabled
Cloudflare: No

# Result: https://myapp.knf-hosting.lt → Your application
```

### 6.3 Using Custom Domains

For custom domains, users must configure DNS at their registrar:

| Record Type | Name | Value |
|-------------|------|-------|
| A | `myapp.example.com` | `158.129.172.222` |
| CNAME | `myapp.example.com` | `knf-hosting.lt` |

### 6.4 DNS Propagation

After adding a custom domain:
1. Configure DNS at registrar/provider
2. Wait for propagation (up to 48 hours)
3. Platform will attempt certificate issuance
4. HTTPS becomes available

### 6.5 Cloudflare DNS Setup

For Cloudflare-proxied domains:

1. Add domain to Cloudflare
2. Set DNS record pointing to `158.129.172.222`
3. Enable proxy (orange cloud)
4. Add domain with `iscloudflare: 1` (uses internal TLS)

---

## 7. Traffic Routing

### 7.1 Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                      REQUEST ROUTING FLOW                           │
│                                                                     │
│  Client Browser                                                     │
│     │                                                               │
│     │ GET https://myapp.example.com/                                │
│     │                                                               │
│     ▼                                                               │
│  DNS Resolution                                                     │
│     │                                                               │
│     │ myapp.knf-hosting.lt → 158.129.172.222 (User Apps IP)         │
│     │                                                               │
│     ▼                                                               │
│  TLS Handshake                                                      │
│     │                                                               │
│     │ SNI: myapp.example.com                                        │
│     │ Certificate presented                                         │
│     │                                                               │
│     ▼                                                               │
│  Caddy Routing                                                      │
│     │                                                               │
│     │ Match: myapp.example.com                                      │
│     │ Target: hosting-users-dind-1:80                               │
│     │                                                               │
│     ▼                                                               │
│  Virtual Server                                                     │
│     │                                                               │
│     │ Internal Caddy routes to user app                             │
│     │                                                               │
│     ▼                                                               │
│  User Application                                                   │
│     │                                                               │
│     │ Response generated                                            │
│     │                                                               │
│     ▼                                                               │
│  Response to Client                                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.2 Multiple Domains per Server

A virtual server can have multiple domains:

```
# All point to the same virtual server
app.example.com      → hosting-users-dind-42:80
www.app.example.com  → hosting-users-dind-42:80
api.example.com      → hosting-users-dind-42:80
```

The virtual server's internal routing handles path-based routing if needed.

---

## 8. Database Schema

### 8.1 Domain Names Table

```sql
CREATE TABLE Hosting_DomainNames (
    ID INTEGER PRIMARY KEY AUTOINCREMENT,
    VirtualServerID INTEGER NOT NULL,
    DomainName TEXT NOT NULL UNIQUE,
    IsCloudflare INTEGER NOT NULL DEFAULT 0,
    SSL INTEGER NOT NULL DEFAULT 0
);
```

### 8.2 Indexes

```sql
-- Implicit unique index on DomainName
-- Consider adding:
CREATE INDEX idx_domains_server ON Hosting_DomainNames(VirtualServerID);
```

---

## 9. Error Handling

### 9.1 Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Domain name is already taken" | Duplicate domain | Choose different domain |
| "Domain must start and end with letters" | Invalid format | Fix domain format |
| "Domain name must contain at least one dot" | Missing TLD | Add TLD (.com, .org, etc.) |
| Certificate error | DNS not configured | Configure DNS first |
| 502 Bad Gateway | Virtual server not running | Start virtual server |

### 9.2 Certificate Troubleshooting

**Let's Encrypt failures**:
```bash
# Check Caddy logs
docker logs hosting-users-caddy

# Verify DNS resolution
dig myapp.example.com

# Test HTTP challenge path
curl http://myapp.example.com/.well-known/acme-challenge/test
```

---

## 10. Best Practices

### 10.1 Domain Naming

- Use descriptive subdomain names
- Avoid special characters
- Keep domains short but meaningful
- Consider using dedicated domains per application

### 10.2 SSL/TLS

- Always enable SSL for production applications
- Use Cloudflare for DDoS protection
- Monitor certificate expiration

### 10.3 DNS Configuration

- Use low TTL during setup
- Increase TTL after verification
- Consider CNAME for flexibility

---

## Next Document

Continue to [06-DATABASE-SCHEMA.md](06-DATABASE-SCHEMA.md) for database structure details.

