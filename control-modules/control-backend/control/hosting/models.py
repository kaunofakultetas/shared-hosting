############################################################
#  [*] Hosting models — virtual servers, containers, domains
#
#  Fresh, properly-constrained schema (see users/models.py
#  for the conventions). All relations are real ForeignKeys.
#
#  THE VM ID IS THE PLATFORM CONTRACT: it names the
#  hosting-users-dind-<ID> container, the server<ID> SSH
#  login, the SERVERS/<ID> data directory and the :8443 tool
#  routing. The transfer script must import VMs with their
#  original IDs; SQLite's AUTOINCREMENT then never reuses
#  them. Row ID 0 is the reserved "HOST" row bootstrap_db
#  seeds — host containers hang off it, and AUTOINCREMENT
#  never assigns 0, so it stays reserved.
############################################################

from django.db import models

from control.users.models import SystemUser


# The platform-wide naming contract: VM <id> runs in the host
# container DIND_PREFIX + <id>. The single definition — the
# views and the monitor import it from here.
DIND_PREFIX = 'hosting-users-dind-'








############################################################
# VirtualServer
############################################################
#
# One user VM. enabled mirrors running/stopped; deleted is
# the soft delete (rows are never hard-deleted by the app —
# the ID must stay claimed forever). owner is NULL for
# containers the monitor adopted without a known owner, and
# for VMs whose owner account was deleted.
#
# created_at/updated_at are automatic on ORM save; the
# .update() call sites set updated_at explicitly (auto_now
# does not fire on .update()).
#
# Used by:
#   - vm_views — list/control; dns_views — ownership
#   - monitor_containers — adopts discovered containers
############################################################

class VirtualServer(models.Model):

    # Columns
    owner = models.ForeignKey(SystemUser, null=True, blank=True, on_delete=models.SET_NULL, related_name='virtual_servers')
    name = models.CharField(max_length=255, default='')
    enabled = models.BooleanField(default=True)
    deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # String representation
    def __str__(self):
        return f'#{self.id} {self.name}'








############################################################
# DockerContainer
############################################################
#
# The 3-second cache of `docker ps` output — host containers
# under the reserved HOST row (parent_server 0), each VM's
# containers under its row. Rewritten continuously by
# monitor_containers; synced_at is the monitor's bookkeeping
# timestamp (rows not seen for 5 minutes are swept). All
# docker columns are CLI-style display strings rendered
# verbatim by the UI — including created_at, which is
# docker's own text, not a DateTimeField on purpose.
#
# Used by:
#   - monitor_containers — the only writer
#   - vm_views — the VM list is driven by these rows
############################################################

class DockerContainer(models.Model):

    # Columns
    parent_server = models.ForeignKey(VirtualServer, on_delete=models.CASCADE, related_name='containers')
    docker_id = models.CharField(max_length=255)
    command = models.TextField()
    created_at = models.TextField()
    image = models.TextField()
    labels = models.TextField()
    mounts = models.TextField()
    names = models.TextField()
    networks = models.TextField()
    ports = models.TextField()
    running_for = models.TextField()
    size = models.TextField()
    state = models.TextField()
    status = models.TextField()
    synced_at = models.DateTimeField()

    # Constraints
    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['docker_id', 'parent_server'], name='unique_dockerid_parent'),
        ]

    # String representation
    def __str__(self):
        return f'{self.names} (parent {self.parent_server_id})'








############################################################
# DomainName
############################################################
#
# One vhost of a VM. domain_name is globally unique (a
# database constraint — one domain can only ever point at
# one VM). Dies with its VM row (CASCADE); the soft-delete
# flow still removes domains explicitly and regenerates the
# users Caddyfile.
#
# Used by:
#   - dns_views — CRUD; vm_views — the cards' domain chips
#   - docker_controller.update_caddy_config — the payload
############################################################

class DomainName(models.Model):

    # Columns
    virtual_server = models.ForeignKey(VirtualServer, on_delete=models.CASCADE, related_name='domains')
    domain_name = models.CharField(max_length=255, unique=True)
    is_cloudflare = models.BooleanField(default=False)
    ssl = models.BooleanField(default=False)

    # String representation
    def __str__(self):
        return self.domain_name
