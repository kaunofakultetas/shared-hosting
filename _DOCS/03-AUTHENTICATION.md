# Authentication and Authorization

This document describes the authentication mechanisms, authorization model, and security considerations for user access control in the App Hosting Platform.

---

## 1. Authentication Overview

### 1.1 Authentication Methods

The platform supports two authentication methods:

| Method | Use Case | Mechanism |
|--------|----------|-----------|
| **Session-based** | Web UI access | Flask-Login with cookies |
| **API Key** | SSH routing | Shared secret between services |

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
# 1. Input validation
if not email or not password:
    return "Error message"

# 2. Normalize input
email = email.strip().lower()
password = password.strip()

# 3. Fetch user from database
user = get_user_by_email(email)

# 4. Verify password with bcrypt
if bcrypt.checkpw(password.encode(), user.password.encode()):
    login_user(user)  # Set session
    return "OK"

# 5. Timing attack protection
# Always perform bcrypt check to prevent enumeration
bcrypt.checkpw("dummy", "$2b$12$dummy_hash")
return "Invalid credentials"
```

**Response**:
- Success: `200 OK` with session cookie
- Failure: `200 OK` with error message (no status code change for security)

### 2.2 Session Management

**Cookie Configuration**:
- Name: `session`
- HttpOnly: Yes (prevents XSS)
- Secure: Yes (HTTPS only)
- SameSite: Lax

**Session Storage**: Server-side (Flask default)

**Session Lifetime**: Until browser closes (default Flask-Login behavior)

### 2.3 Authentication Verification

**Endpoint**: `GET /api/checkauth`

Used by frontend to verify if user is logged in.

**Process**:
1. Check session cookie validity
2. Verify user account is enabled
3. Update `LastLogin` timestamp
4. Return user info

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
    # Admins can access any VM
    if user.admin == 1:
        return True
    
    # Users can only access their own VMs
    owner_id = get_vm_owner(vm_id)
    return owner_id == user.id
```

### 2.5 Admin Check

**Endpoint**: `GET /api/checkauth/admin`

Verifies user has administrator privileges.

**Decorator Implementation**:
```python
def admin_required(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        if 'admin' not in current_user.__dict__:
            return jsonify({'message': 'Unauthorized: Admin required'}), 401
        if not current_user.admin:
            return jsonify({'message': 'Unauthorized: Admin required'}), 401
        return func(*args, **kwargs)
    return wrapper
```

**Note**: The `admin_required` decorator should be used in combination with `@login_required` to ensure the user is authenticated first.

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
| User Registration | 6 characters | Basic requirement |
| Password Change | 8 characters | Stricter for existing users |
| Admin User Create | 8 characters | Intended (see note below) |

> **⚠️ Implementation Note**: The admin user creation endpoint currently only checks for non-empty passwords, though the error message states "8 characters". This inconsistency should be addressed in the codebase.

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
│  │  3. Validate API key                    │                        │
│  │  4. Lookup server owner                 │                        │
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

### 5.3 Internal SSH Connection

Once authenticated, the router connects to the virtual server:
- Host: `hosting-users-dind-{id}`
- Port: 22
- User: root
- Password: root (internal, not exposed)

---

## 6. Authorization Model

### 6.1 Role-Based Access Control

| Role | ID | Capabilities |
|------|-----|--------------|
| User | 0 | Own resources only |
| Admin | 1 | All resources |

### 6.2 Resource Ownership

Each virtual server has an owner:
```sql
CREATE TABLE Hosting_VirtualServers (
    ID INTEGER PRIMARY KEY,
    OwnerID INTEGER NOT NULL,  -- References System_Users.ID
    ...
);
```

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
| Timing Attack | Constant-time comparison | Always run bcrypt |
| Session Hijacking | HttpOnly cookies | Flask default |
| CSRF | SameSite cookies | Lax mode |
| User Enumeration | Generic error messages | Same response |

### 7.2 Timing Attack Prevention

```python
# Always perform bcrypt check, even if user not found
if user is None:
    # Dummy check to prevent timing difference
    bcrypt.checkpw(
        b"dummy",
        b"$2b$12$dummy_hash_to_prevent_timing_attack"
    )
    return "Invalid credentials"
```

### 7.3 Activity Logging

All authentication events are logged:
```python
conn.execute(
    'INSERT INTO System_RecentActivity (UserID, Message, Time) VALUES (?, ?, ?)',
    [user.id, f'User {user.email} logged in (IP: {ip})', timestamp]
)
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
SELECT ID, Email, Password, Enabled FROM System_Users WHERE Email = 'user@example.com';
```

### 10.2 Session Issues

**Problem**: Logged out unexpectedly

**Possible Causes**:
1. Server restart cleared sessions
2. Cookie expired or deleted
3. Session secret key changed

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

