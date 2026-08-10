############################################################
#  [*] control — the Django project package
#
#  The API-only backend of the App Hosting Platform: no
#  admin site, no templates, no static files — thirteen
#  JSON/plain-text endpoints behind the control Caddy.
#  manage.py and gunicorn import this package as
#  `control.settings` and `control.wsgi`.
#
#  Layout:
#    settings.py   — the single env-driven settings file
#    urls.py       — the whole API surface, annotated
#    wsgi.py       — the gunicorn entry point
#    common/       — session auth + shared helpers
#    users/        — accounts, registration codes, activity
#    hosting/      — VMs, container cache, domains
#    dashboard/    — admin Home metrics
#
#  common/ and the apps' api/ directories are namespace
#  packages (no __init__ on purpose, house style) — only the
#  packages Django itself needs to be "real" ones (the apps,
#  migrations/, management/) carry an __init__.py like this.
############################################################
