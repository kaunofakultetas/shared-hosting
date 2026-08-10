# Authentication and Authorization

This document describes the authentication mechanisms, authorization model, and security considerations for user access control in the App Hosting Platform.

---

## 1. Authentication Overview

### 1.1 Authentication Methods

The platform supports two authentication methods:

| Method | Use Case | Mechanism |
|--------|----------|-----------|
| **Session-based** | Web UI access | Django DB-backed sessions + hand-rolled decorators (`control/common/auth.py`) |
| **API Key** | SSH routing | Shared secret between services (constant-time compare, fails closed) |

### 1.2 Authentication Flow Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                              │
│                                                                     │
│   ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌──────────┐      │
│   │ Browser │────▶│  Caddy  │────▶│ Backend │────▶│ Database │      │
│   └─────────┘     └─────────┘     └─────────┘     └──────────┘      │
│        │               │               │               │            │
│        │  1. POST /api/login           │               │            │
│        │───────────────────────────────▶               │            │
│        │               │               │               │            │
│        │               │  2. Query     │  3. SELECT    │            │
│        │               │    user       │    Password   │            │
│        │               │               │───────────────▶            │
│        │               │               │               │            │
│        │               │  4. bcrypt    │◀──────────────│            │
│        │               │    verify     │               │            │
│        │               │               │               │            │
│        │  5. Set-Cookie: session=xxx   │               │            │
│        │◀──────────────────────────────│               │            │
│        │               │               │               │            │
│        │  6. Redirect to dashboard     │               │            │
│        │◀──────────────────────────────│               │            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Session-Based Authentication

### 2.1 Login Process

**Endpoint**: `POST /api/login`

**Request**:
```json
{
    "email": "user@example.com",
    "password": "userpassword"
}
```

**Server-Side Process**:
```python
# 1. Input validation → 400 with a machine code
#    (MISSING_CREDENTIALS / MISSING_EMAIL / MISSING_PASSWORD)

# 2. Normalize input
email = email.strip().lower()
password = password.strip()

# 3. Fetch user; unknown email pays a DUMMY bcrypt instead of
#    the real one, so every outcome costs exactly one bcrypt
#    and timing reveals nothing

# 4. Verify password with bcrypt; success requires the account
#    to be ENABLED — a disabled account with the correct
#    password answers the same 401 in the same time

# 5. Success: rotate the session key (fixation defense), store
#    the user id in the session, log the activity
```

**Response**:
- Success: `200 {"message": "OK"}` with the session cookie
- Missing input: `400` with `MISSING_CREDENTIALS` / `MISSING_EMAIL` / `MISSING_PASSWORD`
- Unknown email, wrong password OR disabled account: `401 {"message": "INVALID_CREDENTIALS"}` — indistinguishable on purpose

The login page maps the machine codes to its own wording.

### 2.2 Session Management

**Cookie Configuration**:
- Name: `session`
- HttpOnly: Yes — JavaScript never touches it; logout is a real endpoint
- Secure: Outside development only (`SESSION_COOKIE_SECURE = not DEBUG` — dev over plain HTTP would otherwise refuse the cookie)
- SameSite: Lax

**Session Storage**: Server-side rows in `django_session`
(`SESSION_ENGINE = django.contrib.sessions.backends.db`) — the cookie holds
only the session key.

**Session Lifetime**: Until the browser closes
(`SESSION_EXPIRE_AT_BROWSER_CLOSE = True`).

**Secret Key**: `DJANGO_SECRET_KEY` from `.env`, generated once by
`runUpdateThisStack.sh` and stable across restarts — deploys do not log
anyone out.

**Logout**: `POST /api/logout` flushes the session (server row + cookie),
needs no login and always answers `200 {"message": "OK"}` — the login page
calls it on mount, so opening `/login` IS the logout. Disabling an account
also ends its live sessions immediately: session resolution only accepts
enabled accounts.

### 2.3 Authentication Verification

**Endpoint**: `GET /api/checkauth`

Used by frontend to verify if user is logged in.

**Process**:
1. Resolve the session to an enabled account (disabled → 401)
2. Bump the `last_login` ("last seen") timestamp — at most once per
   minute, because every SPA page load AND every :8443 forward_auth
   subrequest lands here
3. Return user info

**Response**:
```json
{
    "id": 1,
    "email": "user@example.com",
    "admin": 0
}
```

### 2.4 Virtual Server Access Check

**Endpoint**: `GET /api/checkauth/vm/{virtualServerID}`

Verifies user can access a specific virtual server.

**Authorization Logic**:
```python
def check_user_is_allowed_to_access_vm(user, vm_id):
    # Admins may access every EXISTING, non-deleted VM — the
    # existence check keeps forward_auth from proxying tool
    # tabs into dead upstreams
    if user.admin == 1:
        return VirtualServer.objects.filter(id=vm_id, deleted=False).exists()

    # Everyone else: only their own live VMs
    owner_id = VirtualServer.objects.filter(id=vm_id, deleted=False) \
                                    .values_list('owner_id', flat=True).first()
    return owner_id is not None and owner_id == user.id
```

Unknown and soft-deleted VMs answer 401 for everyone, admins included.

### 2.5 Admin Check

**Endpoint**: `GET /api/checkauth/admin`

Verifies user has administrator privileges.

**Decorator Implementation** (`control/common/auth.py`):
```python
def admin_required(func):
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        thisUser = get_current_user(request)   # session → enabled account
        if thisUser is None or not thisUser.admin:
            return JsonResponse({'message': 'Unauthorized: Admin required'}, status=401)
        request.current_user = thisUser
        return func(request, *args, **kwargs)
    return wrapper
```

`admin_required` resolves the session itself — it implies `login_required`,
so views carry it alone.

---

## 3. Password Security

### 3.1 Password Hashing

**Algorithm**: bcrypt with 12 rounds

**Hash Generation**:
```python
password_hash = bcrypt.hashpw(
    password.encode('utf-8'),
    bcrypt.gensalt(rounds=12)
).decode('utf-8')
```

**Hash Format**: `$2b$12$[22 char salt][31 char hash]`

**Example**: `$2b$12$4a3b6u7a1oBdtvuTkvw9TevgCwH36raEE2oe1BI9Wtt7.L4Pfb4YW`

### 3.2 Password Requirements

| Context | Minimum Length | Notes |
|---------|---------------|-------|
| User Registration | 8 characters | |
| Password Change | 8 characters | |
| Admin User Create/Edit | 8 characters | Enforced (edit may leave the password empty to keep it) |

Passwords are **stripped of surrounding whitespace before hashing and
before checking, everywhere** — an unstripped hash could never be matched
at login again.

### 3.3 Password Change

**Endpoint**: `POST /api/account/change-password`

**Request**:
```json
{
    "currentPassword": "oldpassword",
    "newPassword": "newpassword123"
}
```

**Process**:
1. Verify current password
2. Validate new password length (≥ 8 chars)
3. Hash new password with bcrypt
4. Update database
5. Log activity

---

## 4. User Registration

### 4.1 Registration Code System

New users can only register with a valid registration code generated by an administrator.

**Code Properties**:
- Length: 8 characters
- Format: Uppercase alphanumeric
- Validity: 30 minutes
- One-time use: No (can register multiple users)
- One live code per admin (a OneToOne constraint — creating again replaces it)
- `validUntil` is unix epoch seconds; expired codes are purged as a side
  effect of the widget's GET poll

### 4.2 Registration Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    REGISTRATION FLOW                                │
│                                                                     │
│  ADMIN                                                              │
│    │                                                                │
│    │ 1. POST /api/account/registration-code                         │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │  Generate code: "ABC12345"              │                        │
│  │  Valid until: now + 30 minutes          │                        │
│  └─────────────────────────────────────────┘                        │
│                      │                                              │
│                      │ Share code with new user                     │
│                      ▼                                              │
│  NEW USER                                                           │
│    │                                                                │
│    │ 2. POST /api/register                                          │
│    │    { registrationCode, email, password }                       │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │  Validate code                          │                        │
│  │  Check email not taken                  │                        │
│  │  Create user (enabled: true)            │                        │
│  └─────────────────────────────────────────┘                        │
│                      │                                              │
│                      ▼                                              │
│  ┌─────────────────────────────────────────┐                        │
│  │  User can now login                     │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Registration Code API

**Create Code**: `POST /api/account/registration-code`
```json
Response:
{
    "message": "Registration code created successfully",
    "code": "ABC12345",
    "validUntil": 1699999999
}
```

**Get Current Code**: `GET /api/account/registration-code`
```json
Response:
{
    "message": "Registration code found",
    "code": "ABC12345",
    "validUntil": 1699999999
}
```

**Delete Code**: `DELETE /api/account/registration-code`
```json
Response:
{
    "message": "Registration code deleted successfully"
}
```

---

## 5. SSH Authentication

### 5.1 SSH Router Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SSH AUTHENTICATION                             │
│                                                                     │
│  SSH Client                                                         │
│    │                                                                │
│    │ ssh server1@hosting.knf.vu.lt                                  │
│    │ Password: [user's platform password]                           │
│    │                                                                │
│    ▼                                                                │
│  ┌─────────────────────────────────────────┐                        │
│  │  ROUTER (Port Forward: 22 → 10022)      │                        │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│                   ▼                                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │         SSH ROUTER (host:10022→:2222)   │                        │
│  │                                         │                        │
│  │  1. Parse username "server1"            │                        │
│  │  2. Extract server ID: 1                │                        │
│  │                                         │                        │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│                   │ POST /api/sshrouter                             │
│                   │ { username, api_key }                           │
│                   │                                                 │
│                   ▼                                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │           BACKEND API                   │                        │
│  │                                         │                        │
│  │  3. Validate API key (constant-time;    │                        │
│  │     unconfigured key → 503 fail-closed) │                        │
│  │  4. Lookup server owner (deleted VM →   │                        │
│  │     404; disabled/no owner → null hash) │                        │
│  │  5. Return password hash                │                        │
│  │                                         │                        │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│                   │ { password_hash, upstream_host, ... }           │
│                   │                                                 │
│                   ▼                                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │           SSH ROUTER                    │                        │
│  │                                         │                        │
│  │  6. Verify password against hash        │                        │
│  │  7. Connect to upstream server          │                        │
│  │                                         │                        │
│  └────────────────┬────────────────────────┘                        │
│                   │                                                 │
│                   │ SSH connection                                  │
│                   │                                                 │
│                   ▼                                                 │
│  ┌─────────────────────────────────────────┐                        │
│  │  hosting-users-dind-1 (port 22)         │                        │
│  │  Login as: root                         │                        │
│  └─────────────────────────────────────────┘                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 SSH Credentials

| Field | Value | Notes |
|-------|-------|-------|
| Username | `server{id}` | e.g., `server1`, `server42` |
| Password | User's platform password | Same as web login |
| Host | `hosting.knf.vu.lt` | Control panel domain |
| Port | 22 | Standard SSH port (forwarded to 10022 internally) |

**Connection Command**:
```bash
ssh server1@hosting.knf.vu.lt
# Enter your platform password when prompted
```

A **disabled account loses SSH exactly like it loses the panel**: the
lookup answers a null hash, which can never verify. Deleted VMs answer 404
— any non-200 denies the login.

### 5.3 Internal SSH Connection

Once authenticated, the router connects to the virtual server:
- Host: `hosting-users-dind-{id}`
- Port: 22
- User: root
- Password: root (internal, not exposed)

---

## 6. Authorization Model

### 6.1 Role-Based Access Control

| Role | `admin` flag | Capabilities |
|------|-----|--------------|
| User | false (JSON: 0) | Own resources only |
| Admin | true (JSON: 1) | All resources |

### 6.2 Resource Ownership

Each virtual server has an owner — a real foreign key:
```python
class VirtualServer(models.Model):
    owner = models.ForeignKey(SystemUser, null=True, on_delete=models.SET_NULL, ...)
```
(`hosting_virtualserver.owner_id → users_systemuser.id`; NULL for
monitor-adopted VMs and after the owner account is deleted.)

### 6.3 Permission Checks

**Virtual Server Access**:
```python
def can_access_vm(user, vm_id):
    if user.admin:
        return True
    return vm_owner(vm_id) == user.id
```

**Domain Management**:
```python
def can_manage_domain(user, vm_id):
    # User must have access to the VM
    return can_access_vm(user, vm_id)
```

**User Management**:
```python
def can_manage_users(user):
    return user.admin == 1
```

---

## 7. Security Controls

### 7.1 Implemented Protections

| Attack | Protection | Implementation |
|--------|------------|----------------|
| Password Guessing | bcrypt (slow hash) | 12 rounds |
| Timing Attack | One bcrypt per login outcome | Real check or dummy — never zero, never two |
| Session Hijacking | HttpOnly + Secure cookies | Django settings (Secure outside DEBUG) |
| Session Fixation | Key rotation on login | `session.cycle_key()` |
| CSRF | SameSite cookies + Caddy Origin check | Lax mode; foreign Origin → 403 at the proxy |
| User Enumeration | One generic 401 | Unknown / wrong password / disabled — identical |
| SSH key probing | Constant-time compare, fail-closed | `hmac.compare_digest`; unconfigured key → 503 |

### 7.2 Timing Attack Prevention

Every login outcome costs exactly **one** bcrypt: the real check when the
account exists, a dummy check when it does not. A correct password on a
disabled account takes the same time as a wrong password — the response is
always `401 INVALID_CREDENTIALS`.

```python
if thisUser is None:
    # The dummy substitutes for the real check
    bcrypt.checkpw(b'...', DUMMY_BCRYPT_HASH.encode())
    return JsonResponse({'message': 'INVALID_CREDENTIALS'}, status=401)

passwordOk = bcrypt.checkpw(password.encode(), thisUser.password.encode())
if passwordOk and thisUser.enabled == 1:
    ...  # success
return JsonResponse({'message': 'INVALID_CREDENTIALS'}, status=401)
```

### 7.3 Activity Logging

All authentication events are logged through the shared helper:
```python
log_activity(user.id, f'User {user.email} logged in (IP: {ip})')
# → one users_recentactivity row; created_at stamps itself;
#   the author detaches (SET_NULL) if the account is ever deleted
```

---

## 8. Caddy Forward Authentication

### 8.1 Protected Routes

Caddy uses forward authentication for protected resources:

```
handle /dbgate/* {
    forward_auth hosting-control-backend:8000 {
        uri /api/checkauth/admin
    }
    reverse_proxy hosting-control-dbgate:3000
}
```

### 8.2 VM Panel Authentication

Port 8443 provides direct access to VM management interfaces:

```
{domain}:8443 {
    forward_auth hosting-control-backend:8000 {
        uri /api/checkauth/vm/{http.request.cookie.virtual-server-id}
    }
    reverse_proxy hosting-users-dind-{http.request.cookie.virtual-server-id}:10080
}
```

---

## 9. Default Credentials

### 9.1 Initial Admin Account

| Field | Value |
|-------|-------|
| Email | admin@admin.com |
| Password | admin |
| Admin | Yes |
| Enabled | Yes |

**⚠️ IMPORTANT**: Change this password immediately after installation!
The account is seeded by `bootstrap_db` (which runs at container start)
**only while the users table is completely empty** — it never resurrects.

### 9.2 Virtual Server Internal Credentials

| Service | User | Password | Notes |
|---------|------|----------|-------|
| SSH (internal) | root | root | Not directly accessible |
| Docker | N/A | N/A | Unix socket |

---

## 10. Troubleshooting

### 10.1 Login Issues

**Problem**: "Invalid credentials" error

**Solutions**:
1. Verify email is lowercase
2. Check user is enabled in database
3. Verify password hash is valid bcrypt format

**Debug Query**:
```sql
SELECT id, email, enabled FROM users_systemuser WHERE email = 'user@example.com';
```

### 10.2 Session Issues

**Problem**: Logged out unexpectedly

**Possible Causes**:
1. Browser closed (sessions end with the browser session)
2. The account was disabled — live sessions stop resolving immediately
3. The session row was flushed (a logout, or `clearsessions` housekeeping)

Sessions are server-side rows signed with a stable key from `.env` —
restarts and deploys do NOT log anyone out.

### 10.3 SSH Access Issues

**Problem**: SSH connection refused

**Check**:
1. SSH router container running
2. Backend API accessible
3. Virtual server running
4. Correct username format (`server{id}`)

---

## Next Document

Continue to [04-VIRTUAL-SERVERS.md](04-VIRTUAL-SERVERS.md) for virtual server lifecycle management.

