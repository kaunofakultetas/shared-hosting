# Security Considerations

This document provides a comprehensive overview of security measures implemented in the App Hosting Platform, potential threats, and recommendations for security hardening.

---

## 1. Security Architecture Overview

### 1.1 Defense in Depth

The platform implements multiple layers of security:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SECURITY LAYERS                                │
│                                                                     │
│  Layer 1: Network Perimeter                                         │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  • Geographic access control (VU networks only)               │  │
│  │  • TLS encryption for all traffic                             │  │
│  │  • Rate limiting (Cloudflare recommended)                     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Layer 2: Network Segmentation                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  • Isolated Docker networks                                   │  │
│  │  • Firewall rules blocking lateral movement                   │  │
│  │  • Internal networks with no internet access                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Layer 3: Application Security                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  • Session-based authentication                               │  │
│  │  • bcrypt password hashing                                    │  │
│  │  • Input validation                                           │  │
│  │  • Authorization checks on all endpoints                      │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Layer 4: Container Isolation                                       │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  • Sysbox runtime for secure DinD                             │  │
│  │  • Read-only filesystems where possible                       │  │
│  │  • Non-root container users                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Authentication Security

### 2.1 Password Security

| Measure | Implementation | Strength |
|---------|----------------|----------|
| Hashing Algorithm | bcrypt | ✓ Strong |
| Cost Factor | 12 rounds | ✓ Adequate |
| Salt | Unique per password | ✓ Strong |
| Timing Attack Prevention | One bcrypt per login outcome (real or dummy) | ✓ Strong |

### 2.2 Session Security

| Measure | Implementation | Status |
|---------|----------------|--------|
| HttpOnly Cookie | Yes (logout is a real endpoint, not JS) | ✓ Enabled |
| Secure Cookie | Outside DEBUG (`SESSION_COOKIE_SECURE = not DEBUG`) | ✓ Enabled in prod |
| SameSite | Lax | ✓ Enabled |
| Session Fixation | Key rotation on login (`cycle_key`) | ✓ Protected |
| Session Storage | Server-side rows (`django_session`) | ✓ Enabled |
| Secret Key | Stable, from `.env` (generated once by the deploy script) | ✓ Enabled |

### 2.3 Recommendations

Still open, in Django terms:

```python
# 1. Absolute session age (today: browser-session only)
SESSION_COOKIE_AGE = 60 * 60 * 24        # + keep EXPIRE_AT_BROWSER_CLOSE

# 2. Login rate limiting — the endpoint Caddy is stock (no
#    rate_limit directive), so this belongs in the view: a
#    small cache-based per-IP cooldown in login_view.

# 3. Session housekeeping — expired django_session rows are
#    only removed by `manage.py clearsessions` (cron job).
```

---

## 3. Network Security

### 3.1 Network Isolation Matrix

| From \ To | Control Panel | Control Docker | Users Network | Internet |
|-----------|:-------------:|:--------------:|:-------------:|:--------:|
| External | ✓ (geo-restricted) | ✗ | ✓ (via proxy) | ✓ |
| Control Panel | ✓ | ✓ | ✗ | ✗ |
| Control Docker | ✗ | ✓ | ✓ (via socket) | ✗ |
| Users Network | ✗ | ✓ (via socket) | ✓ | ✓ (filtered) |

### 3.2 Firewall Rules

**Implemented Rules**:
```bash
# Block access to private networks
iptables -A FORWARD -s 172.19.2.0/24 -d 172.16.0.0/12 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 192.168.0.0/16 -j DROP
iptables -A FORWARD -s 172.19.2.0/24 -d 10.0.0.0/8 -j DROP
```

**Additional Recommendations**:
```bash
# Block metadata endpoints (AWS, GCP, Azure)
iptables -A FORWARD -s 172.19.2.0/24 -d 169.254.169.254 -j DROP

# Limit outbound connections per container
iptables -A FORWARD -s 172.19.2.0/24 -p tcp --syn -m connlimit --connlimit-above 100 -j DROP

# Log suspicious activity
iptables -A FORWARD -s 172.19.2.0/24 -m limit --limit 5/min -j LOG --log-prefix "USERS-FW: "
```

### 3.3 Geographic Restrictions

**Current Implementation** (Caddy):
```
(allow_only_vu) {
    # Local/Docker networks
    remote_ip 172.16.0.1/16      # Docker internal
    remote_ip 192.168.0.1/16     # Private networks
    remote_ip 10.0.0.1/8         # Private networks
    
    # VU VPN networks
    remote_ip 193.219.95.0/24    # VU VPN
    remote_ip 10.198.0.0/16      # VU VPN internal
    remote_ip 158.129.162.0/24   # VU VPN
    
    # VU KNF external network
    remote_ip 158.129.172.0/24   # KnF network
}
```

### 3.4 Port Forward Exposure

The 30000-30029 pool exposes user TCP services to the whole internet —
deliberately, like the HTTP side (user apps carry no geo-block either).
The containment is structural:

| Control | Implementation |
|---------|----------------|
| Bounded pool | Only 100 high ports published; bounds validated by the backend against the SAME env values compose publishes |
| One port, one VM | `public_port` is database-unique; forwards resolve by (forward id AND VM id) |
| Per-VM quota | 5 forwards per VM — one server cannot hoard the shared pool |
| Upstreams by construction | The renderer only ever emits `hosting-users-dind-<id>:<port>` upstreams from integer-coerced values; user text (description) never reaches the config |
| Off the ephemeral range | The pool sits below the kernel's ephemeral ports (32768-60999), so host outbound connections can never hold a pool port hostage at bind time |
| Audit trail | Every add/edit/delete writes a RecentActivity row |

Ports without a forward configured refuse connections (nothing listens
behind the published range). A port whose VM is stopped accepts at the
proxy and drops on the failed dial — indistinguishable from a dead app,
which is the honest answer.

---

## 4. Container Security

### 4.1 Sysbox Runtime

Sysbox provides secure Docker-in-Docker:

| Feature | Benefit |
|---------|---------|
| User namespace isolation | Prevents container escape |
| Dedicated kernel namespaces | Full isolation |
| No privileged mode needed | Reduced attack surface |
| Automatic remapping | UID/GID isolation |

### 4.2 Container Hardening

**Current Implementation**:
```yaml
hosting-control-backend:
    user: 1000:1000              # Non-root
    read_only: true              # Immutable filesystem
    tmpfs:
      - /tmp/backend             # Writable scratch (gunicorn heartbeat)
    volumes:
      - ./_DATA/control-backend:/data    # The SQLite file
      - ./_LOGS/control-backend:/logs    # Gunicorn access log (prod)
```

**Recommended Additions**:
```yaml
hosting-control-backend:
    read_only: true
    security_opt:
      - no-new-privileges:true   # Prevent privilege escalation
    cap_drop:
      - ALL                       # Drop all capabilities
    cap_add:
      - NET_BIND_SERVICE          # Only needed capabilities
    pids_limit: 100               # Prevent fork bombs
    mem_limit: 512m               # Memory limits
    cpus: 0.5                     # CPU limits
```

### 4.3 Virtual Server Isolation

Each virtual server runs with:
- Separate network namespace
- Dedicated filesystem volumes
- Unique container IDs
- No shared secrets

---

## 5. API Security

### 5.1 Input Validation

**Container Names**:
```python
if not re.match(r'^[a-z0-9-]{1,25}$', container_name):
    return error("Invalid container name")
```

**Domain Names**:
```python
if not re.match(r'^[a-zA-Z0-9-_.]+$', domainname):
    return error("Invalid domain name")
```

**Virtual Server Names**:
```python
ALLOWED_CHARS = 'aąbcčdeęėfghiįyjklmnopqrsštuųūvwxyzž0123456789_ '
for char in name:
    if char.lower() not in ALLOWED_CHARS:
        return error("Invalid characters")
```

### 5.2 SQL Injection Prevention

All database access goes through the Django ORM — there is no raw SQL in
the backend:
```python
SystemUser.objects.filter(id=user_id).first()   # always parameterized
```

### 5.3 Authorization Checks

Every protected endpoint includes:
```python
@login_required                      # control/common/auth.py
def vm_list(request, virtualServerID=None):
    if not check_user_is_allowed_to_access_vm(request.current_user, virtualServerID):
        return JsonResponse({'message': 'Unauthorized'}, status=401)
    ...
```

Notable properties: unknown and soft-deleted VMs answer 401 uniformly
(admins included); DNS PUT/DELETE resolve domains by **(domain id AND
virtual server id)**, so one VM's endpoint can never edit another VM's
vhosts; `/api/sshrouter` compares its shared key in constant time and fails
closed (503) when the key is unconfigured.

---

## 6. Data Security

### 6.1 Sensitive Data Handling

| Data | Storage | Protection |
|------|---------|------------|
| Passwords | Database | bcrypt hash |
| Session tokens | `django_session` rows in the SQLite file | Signed with the stable secret |
| API keys | Environment variables | Not in code |
| TLS certificates | Volume mounts | File permissions |

### 6.2 Secrets Management

**Current**: Environment variables in docker-compose
```yaml
environment:
  - BACKEND_SSH_API_KEY=${BACKEND_SSH_API_KEY}
```

**Recommended**: Docker secrets or external vault
```yaml
secrets:
  ssh_api_key:
    external: true
services:
  backend:
    secrets:
      - ssh_api_key
```

### 6.3 Data at Rest

| Data | Encryption | Location |
|------|------------|----------|
| Database | None (recommended: encrypted volume) | _DATA/control-backend/database2.db |
| User files | None | SERVERS/{id}/apps/ |
| Docker data | None | SERVERS/{id}/docker/ |
| TLS certs | None (sensitive) | _DATA/*/certs/ |

---

## 7. Threat Model

### 7.1 External Threats

| Threat | Mitigation | Risk Level |
|--------|------------|------------|
| Unauthorized access | Geographic blocking, authentication | Low |
| DDoS attack | Cloudflare (recommended) | Medium |
| Man-in-the-middle | TLS encryption | Low |
| Brute force login | bcrypt slow hash, rate limiting (recommended) | Medium |

### 7.2 Internal Threats (Multi-tenant)

| Threat | Mitigation | Risk Level |
|--------|------------|------------|
| Container escape | Sysbox runtime | Low |
| Network lateral movement | Firewall rules | Low |
| Resource exhaustion | None (recommended: add limits) | High |
| Access to other user data | Authorization checks | Low |

### 7.3 System Threats

| Threat | Mitigation | Risk Level |
|--------|------------|------------|
| Docker socket access | Dedicated network, proxy | Medium |
| Privilege escalation | Non-root containers | Low |
| Data loss | Backups (manual) | Medium |
| Secret exposure | Environment variables | Medium |

---

## 8. Security Hardening Checklist

### 8.1 Immediate Actions

- [ ] **Change default admin password** (through the panel's Account page,
  or by grid edit — the hash lives in `users_systemuser.password`)

- [ ] **Rotate BACKEND_SSH_API_KEY**
  ```bash
  openssl rand -hex 32
  ```

- [ ] **Verify geographic restrictions**
  ```bash
  curl -I https://hosting.knf.vu.lt --header "X-Forwarded-For: 1.2.3.4"
  ```

### 8.2 Short-Term Improvements

- [ ] **Add login rate limiting** (a cache-based per-IP cooldown in
  `login_view` — the endpoint Caddy is stock and has no rate_limit
  directive)

- [ ] **Enable container resource limits**
  ```yaml
  deploy:
    resources:
      limits:
        cpus: '0.5'
        memory: 512M
  ```

- [ ] **Implement an absolute session age**
  ```python
  SESSION_COOKIE_AGE = 60 * 60 * 24   # settings.py
  ```

### 8.3 Long-Term Improvements

- [ ] **Implement secrets management** (HashiCorp Vault)
- [ ] **Add intrusion detection** (fail2ban, OSSEC)
- [ ] **Enable audit logging** (comprehensive activity logs)
- [ ] **Implement backup automation**
- [ ] **Add vulnerability scanning** (Trivy, Clair)

---

## 9. Incident Response

### 9.1 Detecting Compromise

**Signs of Compromise**:
- Unusual container activity in `hosting_dockercontainer`
- Bursts of 401s on `/api/login` in the gunicorn access log
  (`_LOGS/control-backend/access.log` — the activity log records only
  successful logins)
- Unexpected outbound connections from firewall logs

### 9.2 Response Procedures

**Virtual Server Compromise**:
```bash
# 1. Stop the virtual server
docker stop hosting-users-dind-{id}

# 2. Preserve evidence
docker commit hosting-users-dind-{id} evidence-{id}

# 3. Investigate
docker run -it evidence-{id} /bin/bash

# 4. Delete and recreate if needed
docker rm hosting-users-dind-{id}
```

**Backend Compromise**:
```bash
# 1. Rotate all secrets
# 2. Restart all containers
docker-compose down && docker-compose up -d

# 3. Review activity logs
sqlite3 _DATA/control-backend/database2.db "SELECT * FROM users_recentactivity ORDER BY id DESC LIMIT 100"

# 4. Check for unauthorized users
sqlite3 _DATA/control-backend/database2.db "SELECT id, email, admin, enabled FROM users_systemuser"
```

---

## 10. Compliance Considerations

### 10.1 Data Protection

| Requirement | Status | Notes |
|-------------|--------|-------|
| Encryption in transit | ✓ | TLS everywhere |
| Encryption at rest | ✗ | Recommended |
| Access logging | ✓ | Activity log + gunicorn access log (`_LOGS/control-backend/`, prod) |
| Data retention | Manual | No automatic cleanup |

### 10.2 Access Control

| Requirement | Status | Notes |
|-------------|--------|-------|
| Authentication | ✓ | Session-based |
| Authorization | ✓ | Role-based |
| Audit trail | Partial | Login/action logs |
| Password policy | ✓ | Minimum 8 chars, uniform everywhere |

---

## 11. Security Monitoring

### 11.1 Recommended Monitoring

```bash
# Monitor failed logins (the activity log records only successes —
# failures appear as 401s in the gunicorn access log)
grep ' 401 ' _LOGS/control-backend/access.log | grep '/api/login'

# Monitor container states
docker events --filter 'type=container'

# Monitor network connections
docker exec hosting-users-firewall iptables -L -n -v

# Monitor DNS queries
docker logs hosting-users-firewall 2>&1 | grep dnsmasq
```

### 11.2 Alerting Recommendations

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Failed logins | > 5/minute | High |
| Container restarts | > 3/hour | Medium |
| Unusual outbound IPs | Any to blocklist | High |
| Resource usage | > 90% | Medium |

---

## 12. Security Contacts

For security issues:
- Report vulnerabilities to: [security contact email]
- Emergency: [emergency contact]
- Documentation: [docs URL]

---

## Summary

The App Hosting Platform implements a robust security architecture with multiple defensive layers. Key strengths include network isolation, container security via Sysbox, and strong authentication. Areas for improvement include resource limits, comprehensive monitoring, and formal incident response procedures.

**Priority Actions**:
1. Change default credentials
2. Implement rate limiting
3. Add resource constraints
4. Enable encrypted backups
5. Deploy monitoring solution

