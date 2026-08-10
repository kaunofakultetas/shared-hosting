############################################################
#  [*] Django settings — App Hosting Platform backend
#
#  One settings file on purpose — everything environment-
#  specific arrives as docker-compose env vars:
#
#    APP_DEBUG          — "true" enables DEBUG (the compose
#                         slot uses this name; DJANGO_DEBUG
#                         is accepted too)
#    DJANGO_SECRET_KEY  — required outside DEBUG; a stable
#                         value is what keeps sessions alive
#                         across restarts and deploys
#    DB_PATH            — SQLite file, default /data/control.db
#                         (a FRESH file — the legacy
#                         database.db is not touched)
#    DOCKER_CONTROLLER_HOST / _PORT — the docker sidecar
#    CADVISOR_HOST / _PORT          — container metrics
#    BACKEND_SSH_API_KEY            — /api/sshrouter secret
#
#  This is an API-only backend: no admin site, no templates
#  of our own, no static files, no django.contrib.auth — the
#  session auth is hand-rolled in control/common/auth.py so
#  the existing System_Users bcrypt hashes keep working
#  unchanged.
############################################################

import environ
from pathlib import Path

env = environ.Env()

BASE_DIR = Path(__file__).resolve().parent.parent








############################################################
# General
############################################################

# The compose slot sets APP_DEBUG=true for dev; DJANGO_DEBUG
# is the house-standard name — either works
DEBUG = env.bool('DJANGO_DEBUG', default=env.bool('APP_DEBUG', default=False))

# Outside DEBUG the key is required and must be stable — it
# signs the session cookies; see README for generating one
if DEBUG:
    SECRET_KEY = env('DJANGO_SECRET_KEY', default='dev-only-insecure-secret-key')
else:
    SECRET_KEY = env('DJANGO_SECRET_KEY')

TIME_ZONE = 'Europe/Vilnius'
USE_TZ = True

DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'








############################################################
# Hosting
############################################################
#
# The backend only ever runs behind the control Caddy
# endpoint on isolated networks — Caddy owns TLS, the Host
# header and the same-origin (CSRF) check, so Django trusts
# the proxy headers and accepts any host.
############################################################

ALLOWED_HOSTS = ['*']

USE_X_FORWARDED_HOST = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')








############################################################
# Database
############################################################
#
# A FRESH SQLite file owned by this backend alone — real FK
# constraints, boolean and datetime columns. It lives in the
# same /data mount as the legacy database.db, which stays
# untouched until the transfer command imports it.
#
# WAL is deliberately NOT enabled: DBGate bind-mounts bare
# .db files, and a WAL database needs its -wal/-shm sidecar
# files next to it. Instead: a 20 s busy timeout and
# IMMEDIATE transactions, which cover the web workers and
# the monitor container sharing the file.
#
# ATOMIC_REQUESTS wraps every request in one transaction —
# rollback-on-exception everywhere by default.
############################################################

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': env('DB_PATH', default='/data/control.db'),
        'ATOMIC_REQUESTS': True,
        'OPTIONS': {
            'timeout': 20,
            'transaction_mode': 'IMMEDIATE',
        },
    }
}








############################################################
# URLs
############################################################

ROOT_URLCONF = 'control.urls'

WSGI_APPLICATION = 'control.wsgi.application'

# API paths carry no trailing slashes, and redirecting a POST
# to add one would break the SPA — so never append
APPEND_SLASH = False








############################################################
# Apps
############################################################

INSTALLED_APPS = [
    'django.contrib.sessions',

    'control.users',
    'control.hosting',
    'control.dashboard',
]








############################################################
# Middleware
############################################################
#
# Deliberately minimal. No CsrfViewMiddleware — the API
# relies on the Caddy endpoint's Origin check instead of CSRF
# tokens (the SPA never handles a token today and the login
# contract must stay as-is).
############################################################

MIDDLEWARE = [
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
]








############################################################
# Sessions
############################################################
#
# DB-backed sessions in the SQLite file — they survive
# restarts and deploys. The cookie contract the frontend
# relies on: named "session", NOT HttpOnly (the login page's
# logout works by deleting the cookie from JavaScript) and
# browser-session lifetime.
############################################################

SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_NAME = 'session'
SESSION_COOKIE_HTTPONLY = False
SESSION_EXPIRE_AT_BROWSER_CLOSE = True








############################################################
# Templates
############################################################
#
# No templates of our own — this stays only so Django can
# render its own DEBUG error pages.
############################################################

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
            ],
        },
    },
]








############################################################
# Logging
############################################################
#
# Everything to the console — docker logs is the log store.
############################################################

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}
