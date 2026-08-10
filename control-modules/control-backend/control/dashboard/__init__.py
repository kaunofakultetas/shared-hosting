############################################################
#  [*] dashboard app — admin Home metrics
#
#  The three read-only endpoints behind the admin dashboard
#  widgets: system gauges from cAdvisor, the five newest
#  activity rows, and the platform totals. No models and no
#  migrations of its own — it reads the users/hosting tables
#  and the external services, which is why this app is just
#  views and one client module.
#
#  Layout:
#    api/dashboard_views.py  — /api/dashboard/system,
#                              /api/dashboard/recentactivity,
#                              /api/dashboard/hostingsystem
#    registry_monitor.py     — the Docker Hub rate-limit
#                              check (cached 60 s per worker,
#                              reached through the egress
#                              exit proxy)
#    apps.py                 — the AppConfig INSTALLED_APPS
#                              points at
############################################################
