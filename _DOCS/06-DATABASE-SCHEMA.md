# Database Schema

This document describes the SQLite database schema, table relationships, and
data access patterns of the App Hosting Platform's Django backend.

---

## 1. Database Overview

### 1.1 Database Technology

| Property | Value |
|----------|-------|
| Engine | SQLite 3 (Django ORM, `django.db.backends.sqlite3`) |
| Location | `_DATA/control-backend/database2.db` (env `DB_PATH`) |
| Concurrency | 20 s busy timeout + `IMMEDIATE` transactions (web workers + the monitor share the file; WAL is deliberately off so DBGate can mount the bare file) |
| Transactions | `ATOMIC_REQUESTS = True` — every request is one transaction, rollback on exception |
| Schema management | Django migrations (`control/*/migrations/`), applied by `bootstrap_db` at container start |
| Backup | SQLite backup API snapshot (consistent against live writers) |

The legacy `database.db` (the previous backend's `System_Users` /
`Hosting_VirtualServers` tables) is retired; its data was imported once by
`manage.py transfer_legacy` with IDs and bcrypt hashes preserved.

### 1.2 Design Principles

- **Real constraints**: every relation is a ForeignKey with explicit
  `on_delete` behavior; uniqueness rules live in the database, not in code.
- **Real types**: flags are booleans, timestamps are timezone-aware
  datetimes (stored UTC). The API converts at its boundary — JSON still
  exposes 0/1 integers and local `"YYYY-MM-DD HH:MM:SS"` strings, so the
  frontend contract never changed.
- **Soft deletes**: virtual server rows are never removed — the VM ID is a
  platform-wide contract (container name, SSH login, `SERVERS/<id>`
  directory) and `AUTOINCREMENT` guarantees IDs are never reused.
- **Django-default naming**: `<app>_<model>` lowercase table names.

---

## 2. Entity Relationship Model

Paste into [dbdiagram.io](https://dbdiagram.io) for the picture:

```dbml
Table users_systemuser {
  id integer [pk, increment]
  email varchar(255) [unique, not null]
  password varchar(255) [not null, note: 'bcrypt hash (rounds=12)']
  admin boolean [not null, default: false]
  enabled boolean [not null, default: false]
  last_login datetime [null, note: '"last seen" — bumped by checkauth at most once a minute']
}

Table users_registrationcode {
  id integer [pk, increment]
  code varchar(32) [unique, not null]
  valid_until datetime [not null, note: 'API exposes epoch seconds']
  user_id integer [unique, not null, note: 'OneToOne — one live code per admin']
}

Table users_recentactivity {
  id integer [pk, increment]
  message text [not null]
  created_at datetime [not null]
  user_id integer [null, note: 'NULL after author deletion → "Deleted User"']
}

Table hosting_virtualserver {
  id integer [pk, increment, note: 'THE contract: hosting-users-dind-<id>, server<id>, SERVERS/<id>. Row 0 = reserved HOST row']
  name varchar(255) [not null, default: '']
  enabled boolean [not null, default: true]
  deleted boolean [not null, default: false, note: 'soft delete']
  created_at datetime [not null]
  updated_at datetime [not null]
  owner_id integer [null, note: 'NULL = adopted/ownerless VM or deleted owner']
}

Table hosting_dockercontainer {
  id integer [pk, increment]
  docker_id varchar(255) [not null]
  command text [not null]
  created_at text [not null, note: 'docker CLI display string, NOT a datetime']
  image text [not null]
  labels text [not null]
  mounts text [not null]
  names text [not null]
  networks text [not null]
  ports text [not null]
  running_for text [not null]
  size text [not null]
  state text [not null]
  status text [not null]
  synced_at datetime [not null, note: 'monitor bookkeeping — rows unseen 5 min are swept']
  parent_server_id integer [not null, note: '0 (HOST row) = host containers; N = inside VM N']

  indexes {
    (docker_id, parent_server_id) [unique]
  }
}

Table hosting_domainname {
  id integer [pk, increment]
  domain_name varchar(255) [unique, not null, note: 'globally unique — one domain, one VM']
  is_cloudflare boolean [not null, default: false]
  ssl boolean [not null, default: false]
  virtual_server_id integer [not null]
}

Table hosting_vmusage {
  id integer [pk, increment]
  cpu_percent float [null, note: 'share of the whole host; NULL while not running']
  memory_mb integer [null, note: 'working set; NULL while not running']
  disk_mb integer [null, note: 'du of SERVERS/<id>, refreshed ~5 min']
  cpu_measured_at datetime [null]
  disk_measured_at datetime [null]
  virtual_server_id integer [unique, not null, note: 'OneToOne beside the registry row']
}

Table django_session {
  session_key varchar(40) [pk]
  session_data text [not null]
  expire_date datetime [not null]
}

Ref: users_registrationcode.user_id - users_systemuser.id [delete: cascade]
Ref: users_recentactivity.user_id > users_systemuser.id [delete: set null]
Ref: hosting_virtualserver.owner_id > users_systemuser.id [delete: set null]
Ref: hosting_dockercontainer.parent_server_id > hosting_virtualserver.id [delete: cascade]
Ref: hosting_domainname.virtual_server_id > hosting_virtualserver.id [delete: cascade]
Ref: hosting_vmusage.virtual_server_id - hosting_virtualserver.id [delete: cascade]
```

---

## 3. Tables

### 3.1 users_systemuser — accounts

One account per person. `password` is a bcrypt hash (rounds=12) verified
directly — inputs are stripped before hashing and checking, everywhere.
`last_login` is really "last seen": every `/api/checkauth` bumps it, at most
once per minute; `NULL` means never seen. Disabled accounts are refused at
login, lose live sessions immediately (session resolution only accepts
enabled accounts) and their VMs' SSH lookups return a null hash.

Deleting a user is allowed only while they own no non-deleted VMs, and it
**detaches history rather than destroying it**: their registration code dies
(CASCADE), their activity rows and soft-deleted VMs lose the author/owner
(SET_NULL) and render as "Deleted User" / ownerless.

### 3.2 users_registrationcode — self-registration codes

One live code per admin — a OneToOne constraint, upserted on every create.
8 uppercase alphanumeric characters, valid 30 minutes. The API exposes
`valid_until` as unix epoch seconds. Expired codes (any admin's) are purged
as a side effect of the widget's GET poll.

### 3.3 users_recentactivity — the activity log

Append-only. `message` is a free-form English sentence rendered verbatim by
the frontend widgets — treat the wording as part of the UI. Written by
login, registration, password changes and every VM/domain mutation.

### 3.4 hosting_virtualserver — the VM registry

**The ID is the platform contract**: VM N runs in the host container
`hosting-users-dind-N`, is reached by SSH as `serverN`, and keeps its data
in `SERVERS/N`. IDs are never reused (`AUTOINCREMENT`) and rows are never
hard-deleted by the app — `deleted` is the soft-delete flag. Row **ID 0 is
the reserved HOST row** (host containers hang off it in the cache); the
`bootstrap_db` command seeds it and `AUTOINCREMENT` never assigns 0.

`enabled` mirrors the intended run state (start/stop). `owner` is NULL for
VMs the monitor adopted without a known owner, and for VMs whose owner
account was deleted.

### 3.5 hosting_dockercontainer — the 3-second cache

A cache of `docker ps` output, rewritten continuously by the
`monitor_containers` background process: host containers under the HOST row,
each VM's containers under its row. All docker columns are CLI display
strings rendered verbatim by the UI — including `created_at`, which is
docker's own text, not a datetime. `synced_at` is the monitor's bookkeeping
timestamp; rows not seen for 5 minutes are swept. Only the monitor writes
this table. **VM visibility in `/api/vm` is driven by this cache** — a VM
row without a cache row is invisible until the monitor's next pass.

### 3.6 hosting_domainname — vhosts

One row per user domain. `domain_name` is globally unique — one domain can
only ever point at one VM, enforced by the database. Every mutation pushes
the whole table to the docker sidecar (users-Caddyfile regeneration) inside
the request transaction, so the Caddyfile and the table can never diverge.

### 3.7 hosting_vmusage — per-VM resource telemetry

One nullable-everything OneToOne beside the VM registry row, written only by
the monitor: CPU% (share of the whole host) and RAM (working set) from
cAdvisor every 3-second pass — cleared to NULL while the VM is not running —
and disk from the sidecar's `du` sweep over `SERVERS/<id>` every ~5 minutes.
NULL means "not measured (yet)". Serialized as the `usage` object on
`/api/vm`; dies with its VM row (CASCADE).

### 3.8 Django infrastructure

`django_session` (server-side sessions; the cookie holds only the key) and
`django_migrations` (applied-migration bookkeeping). There are no `auth_*`
tables — `django.contrib.auth` is not installed; the session auth is
hand-rolled in `control/common/auth.py`.

---

## 4. Deletion Semantics

| You delete... | What happens |
|---|---|
| A user | Code dies (CASCADE); activity + soft-deleted VMs detach (SET_NULL); refused while non-deleted VMs exist |
| A VM (soft) | `deleted=true`; domains removed explicitly + users Caddyfile regenerated; cache rows removed; ID stays claimed forever |
| A domain | Row removed; users Caddyfile regenerated in the same transaction |
| A container (real world) | The monitor prunes its cache row on the next pass (or the 5-minute sweep) |

---

## 5. Access Patterns

- **The API** reads/writes through the Django ORM only — no raw SQL.
- **The monitor** (`manage.py monitor_containers`) is the only writer of
  `hosting_dockercontainer` and may adopt unknown dind containers as
  ownerless `hosting_virtualserver` rows.
- **DBGate** can browse the file read-only (mount
  `_DATA/control-backend/database2.db`).
- **Migrations discipline**: the initial migrations are hand-written to
  match the models exactly — `manage.py makemigrations --check` proves they
  stayed in sync.
- **The contract test suite** (`manage.py test control`) pins every JSON
  shape derived from this schema.
