# control-backend — the App Hosting Platform API

The Django 5.2 backend of the control panel: an API-only service (no admin
site, no templates) serving fourteen JSON/plain endpoints behind the control
Caddy. One container runs everything — `bootstrap_db` (idempotent migrate +
seeds), the 3-second docker monitor as a supervised background process, and
the web server (runserver in dev, gunicorn in prod).

```
control-backend/
├── Dockerfile                  # deps pinned here; CMD = bootstrap + monitor + server
├── manage.py
└── control/
    ├── settings.py             # single env-driven settings file
    ├── urls.py                 # the whole API surface, annotated
    ├── wsgi.py
    ├── common/auth.py          # hand-rolled session auth (bcrypt, no contrib.auth)
    ├── users/                  # SystemUser / RegistrationCode / RecentActivity
    │   ├── api/                #   login+logout+checkauth, account, admin grid
    │   └── management/commands/{bootstrap_db,transfer_legacy}.py
    ├── hosting/                # VirtualServer / DockerContainer / DomainName
    │   ├── api/                #   vm list+control, dns, sshrouter
    │   ├── docker_controller.py       # HTTP client for hosting-control-docker
    │   └── management/commands/monitor_containers.py
    ├── dashboard/              # cAdvisor gauges, activity feed, totals
    └── tests/                  # the contract test suite (79 tests)
```

## Running

Everything is driven by docker compose (service `hosting-control-backend`).
Startup is self-sufficient: the CMD runs `bootstrap_db` (migrate + the
reserved HOST row + `admin@admin.com`/`admin` while the users table is
empty), starts the monitor loop, then the server.

```bash
sudo docker compose up -d --build hosting-control-backend
```

Dev mode (`APP_DEBUG=true` + the source bind mount in compose) runs
`runserver` with auto-reload; the monitor process does not hot-reload —
restart the container after changing it.

## The contract test suite

```bash
sudo docker exec hosting-control-backend python3 manage.py test control
```

79 tests pin every endpoint's status codes, body shapes and the exact
message strings the frontend renders — run them after every backend change.
`manage.py makemigrations --check` proves models and migrations stayed in
sync.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `APP_DEBUG` / `DJANGO_DEBUG` | off | runserver + DEBUG (dev only; case-insensitive) |
| `DJANGO_SECRET_KEY` | required outside DEBUG | session signing — stable, generated into `.env` by `runUpdateThisStack.sh` |
| `DB_PATH` | `/data/control.db` | the SQLite file (compose sets `/data/database2.db`) |
| `DOCKER_CONTROLLER_HOST` / `_PORT` | `hosting-control-docker` / `8000` | the docker sidecar |
| `CADVISOR_HOST` / `_PORT` | `hosting-control-cadvisor` / `8080` | dashboard gauges |
| `BACKEND_SSH_API_KEY` | — | `/api/sshrouter` shared secret (unset ⇒ fails closed) |

Prod gunicorn writes its access log to `/logs/access.log`
(compose mounts `./_LOGS/control-backend`).

## Design notes

- **Sessions**: DB-backed, cookie `session`, HttpOnly, Secure outside
  DEBUG; logout is `POST /api/logout` (a session flush). Disabling an
  account cuts its live sessions, its login and its SSH at once.
- **Login protocol**: JSON with machine codes; every outcome costs exactly
  one bcrypt, so timing reveals nothing.
- **VM IDs are the platform contract** — container `hosting-users-dind-<id>`,
  SSH login `server<id>`, data dir `SERVERS/<id>`; rows are soft-deleted and
  IDs never reused. Row 0 is the reserved HOST row.
- **VM visibility is cache-driven**: `/api/vm` shows a VM only while the
  monitor has its container in `hosting_dockercontainer`.
- **Domain writes and the users-Caddyfile regeneration share one
  transaction** — they can never diverge.
- The full API is documented in `control-modules/control-swagger/swagger.yaml`
  (served at `/swagger`, admin-gated), the schema in
  `_DOCS/06-DATABASE-SCHEMA.md`.

## One-time commands

- `manage.py transfer_legacy [--source /data/database.db] [--dry-run] [--force]`
  — the historical import of the legacy database; already performed, kept
  for reference.
