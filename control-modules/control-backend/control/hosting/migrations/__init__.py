############################################################
#  [*] hosting migrations — schema history of the hosting app
#
#  0001_initial — VirtualServer (owner SET_NULL), DomainName
#  (globally unique name, CASCADE with its VM) and
#  DockerContainer (the cache, unique per
#  docker_id + parent_server). Written by hand to match
#  models.py exactly — `manage.py makemigrations --check`
#  proves they stayed in sync.
#
#  This file must exist: Django's migration loader SKIPS
#  namespace packages, so without it every migration here
#  silently disappears from `migrate` — a fresh boot would
#  create no tables instead of failing loudly.
############################################################
