############################################################
#  [*] hosting app — virtual servers, containers, domains
#
#  The platform's actual product: per-student docker-in-
#  docker VMs, the 3-second cache of their containers, and
#  the vhost domains the users Caddy routes. The VM ID is
#  the platform-wide contract — it names the
#  hosting-users-dind-<id> container, the server<id> SSH
#  login and the SERVERS/<id> directory; IDs are never
#  reused and row 0 is reserved for the host.
#
#  Layout:
#    models.py               — VirtualServer,
#                              DockerContainer, DomainName
#    api/vm_views.py         — the VM list + start/stop/
#                              create/delete/rename control
#    api/dns_views.py        — domain validation + CRUD
#                              (regenerates the users Caddy)
#    api/sshrouter_views.py  — the SSH router's shared-
#                              secret lookup endpoint
#    docker_controller.py    — HTTP client for the
#                              hosting-control-docker sidecar
#    management/commands/    — monitor_containers
#    migrations/             — schema history
#    apps.py                 — the AppConfig INSTALLED_APPS
#                              points at
############################################################
