############################################################
#  [*] monitor_containers — the 3-second docker monitor
#
#  Runs beside the web server in the same container: the
#  Dockerfile CMD starts exactly one instance BEFORE gunicorn
#  forks its workers and respawns it if it ever exits — a
#  thread inside the Django app would be multiplied into
#  five racing monitors by the five workers.
#
#  Every pass, via the docker sidecar:
#    1. host `docker ps` → cache rows under the HOST row
#       (parent_server 0)
#    2. every running hosting-users-dind-<N> → that VM's
#       `docker ps` → cache rows under parent_server N
#    3. any discovered dind container without a VM row is
#       adopted ownerless (owner NULL) — the safety net for
#       containers created outside the panel
#    4. rows not seen this pass are dropped per parent, and
#       anything unseen for 5 minutes is swept globally
#
#  synced_at is the pass timestamp: one shared value per
#  push, so "not seen this pass" is a plain inequality.
############################################################

import json
import os
import threading
import time
from datetime import datetime, timedelta

import requests
from django.core.management.base import BaseCommand
from django.db import close_old_connections, transaction
from django.utils import timezone

from control.hosting import docker_controller
from control.hosting.models import DIND_PREFIX, DockerContainer, VirtualServer, VmUsage


CADVISOR_HOST = os.getenv('CADVISOR_HOST', 'hosting-control-cadvisor')
CADVISOR_PORT = os.getenv('CADVISOR_PORT', '8080')

# How often the (slow) du-based disk sweep runs
DISK_REFRESH_SECONDS = 300








############################################################
# push_docker_info_to_db
############################################################
#
# One parent's `docker ps` snapshot → the cache, in one
# transaction: upsert every container with one shared
# synced_at, drop the parent's rows that were not in the
# snapshot, and (host pass only) adopt unknown dind
# containers as ownerless VM rows.
############################################################

def push_docker_info_to_db(json_obj, parentServerID=0):
    timeNow = timezone.now()

    with transaction.atomic():
        for container in json_obj['containers']:

            DockerContainer.objects.update_or_create(
                docker_id=container['ID'],
                parent_server_id=parentServerID,
                defaults={
                    'command': container['Command'],
                    'created_at': container['CreatedAt'],
                    'image': container['Image'],
                    'labels': container['Labels'],
                    'mounts': container['Mounts'],
                    'names': container['Names'],
                    'networks': container['Networks'],
                    'ports': container['Ports'],
                    'running_for': container['RunningFor'],
                    'size': container['Size'],
                    'state': container['State'],
                    'status': container['Status'],
                    'synced_at': timeNow,
                },
            )

            # Adopt dind containers that have no VM row — e.g.
            # created by hand on the host. Ownerless on purpose;
            # non-numeric suffixes are skipped. get_or_create
            # stamps the timestamps itself on the create path —
            # existing rows are NOT touched, so updated_at keeps
            # meaning "last state change".
            if parentServerID == 0 and container['Names'].startswith(DIND_PREFIX):
                virtualServerID = container['Names'].replace(DIND_PREFIX, '')
                if virtualServerID.isdigit():
                    VirtualServer.objects.get_or_create(
                        id=int(virtualServerID),
                        defaults={'owner': None, 'name': '', 'enabled': True, 'deleted': False},
                    )

        # Drop this parent's rows that were not in the snapshot
        DockerContainer.objects.filter(parent_server_id=parentServerID).exclude(synced_at=timeNow).delete()








############################################################
# parse_cadvisor_docker
############################################################
#
# cAdvisor's /api/v1.3/docker payload → {vmId: {cpu_percent,
# memory_mb}} for the dind containers. CPU% is a share of
# the whole host: the delta of the cumulative nanosecond
# counter between the two newest samples, over the wall time
# between them, divided by the core count. Fewer than two
# samples → cpu None (the container just started); memory is
# the working set of the newest sample.
#
# Pure function — the contract tests feed it fake payloads.
#
# Used by:
#   - Command.handle (below) — every 3-second pass
############################################################

def parse_cadvisor_docker(dockerPayload, numCores):
    usageByVm = {}

    for node in dockerPayload.values():
        dindAlias = next((a for a in (node.get('aliases') or []) if a.startswith(DIND_PREFIX)), None)
        if dindAlias is None or not dindAlias.replace(DIND_PREFIX, '').isdigit():
            continue
        vmId = int(dindAlias.replace(DIND_PREFIX, ''))

        stats = node.get('stats') or []
        if not stats:
            continue

        memoryMb = round(stats[-1].get('memory', {}).get('working_set', 0) / 1048576)

        cpuPercent = None
        if len(stats) >= 2:
            # Timestamps carry nanoseconds — trim to microseconds
            # for fromisoformat, and drop a surviving Z so both
            # ends of the subtraction are always naive
            t1 = datetime.fromisoformat(stats[-1]['timestamp'][:26].rstrip('Z'))
            t0 = datetime.fromisoformat(stats[-2]['timestamp'][:26].rstrip('Z'))
            wallNs = (t1 - t0).total_seconds() * 1e9
            cpuNs = stats[-1]['cpu']['usage']['total'] - stats[-2]['cpu']['usage']['total']
            if wallNs > 0 and cpuNs >= 0:
                cpuPercent = round(cpuNs / wallNs / max(numCores, 1) * 100, 2)

        usageByVm[vmId] = {'cpu_percent': cpuPercent, 'memory_mb': memoryMb}

    return usageByVm








############################################################
# update_vm_usage
############################################################
#
# Upsert the cAdvisor numbers, then clear CPU/RAM on every
# VM cAdvisor did NOT report (stopped VMs) — stale numbers
# must not keep showing. Disk fields are untouched here.
#
# Used by:
#   - Command.handle (below) — every 3-second pass
############################################################

def update_vm_usage(usageByVm):
    timeNow = timezone.now()
    validIds = set(VirtualServer.objects.filter(id__in=list(usageByVm)).values_list('id', flat=True))
    seenIds = []

    for vmId, stats in usageByVm.items():
        if vmId not in validIds:
            continue
        VmUsage.objects.update_or_create(
            virtual_server_id=vmId,
            defaults={
                'cpu_percent': stats['cpu_percent'],
                'memory_mb': stats['memory_mb'],
                'cpu_measured_at': timeNow,
            },
        )
        seenIds.append(vmId)

    # Clear only rows that still hold numbers — an already-NULL
    # row must not be rewritten every pass (memory_mb is the
    # discriminator: it is set whenever anything was measured)
    VmUsage.objects.exclude(virtual_server_id__in=seenIds).filter(memory_mb__isnull=False).update(cpu_percent=None, memory_mb=None)








############################################################
# refresh_disk_usage
############################################################
#
# Thread target: one sidecar du sweep → disk_mb per VM. Runs
# in its own thread because the du over the inner docker
# trees can take tens of seconds and must never stall the
# 3-second container sync.
#
# Used by:
#   - Command.handle (below) — started every ~5 minutes
############################################################

def refresh_disk_usage():
    try:
        payload = json.loads(docker_controller.get_disk_usage().text)
        timeNow = timezone.now()

        for vmIdText, usedBytes in (payload.get('usage') or {}).items():
            if not vmIdText.isdigit() or not VirtualServer.objects.filter(id=int(vmIdText)).exists():
                continue
            VmUsage.objects.update_or_create(
                virtual_server_id=int(vmIdText),
                defaults={'disk_mb': usedBytes // 1048576, 'disk_measured_at': timeNow},
            )

    except Exception as e:
        print(f'Disk Usage Updater Error: {e}', flush=True)

    finally:
        close_old_connections()








############################################################
# Command
############################################################

class Command(BaseCommand):
    help = 'Polls the docker sidecar every 3 seconds and maintains the containers cache'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Run a single pass and exit (for testing)')


    def handle(self, *args, **options):
        self.stdout.write('Docker monitor started (3 s interval)')

        numCores = None
        lastDiskRun = 0.0        # monotonic; 0 → first pass sweeps immediately
        diskThread = None

        while True:
            if not options['once']:
                time.sleep(3)

            # Update host docker info
            try:
                json_obj = json.loads(docker_controller.get_status('host').text)
                push_docker_info_to_db(json_obj, parentServerID=0)


                # Update users docker info — every running dind
                virtualServerHostnames = list(
                    DockerContainer.objects
                    .filter(parent_server_id=0, names__startswith=DIND_PREFIX, state='running')
                    .values_list('names', flat=True)
                )

                for virtualServerHostname in virtualServerHostnames:
                    try:
                        json_obj = json.loads(docker_controller.get_status(virtualServerHostname).text)
                        push_docker_info_to_db(json_obj, parentServerID=int(virtualServerHostname.replace(DIND_PREFIX, '')))
                    except Exception as e:
                        self.stdout.write(f'Docker Info Updater Error: {e}, container: {virtualServerHostname}')
                        self.stdout.flush()


            except Exception as e:
                self.stdout.write(f'Docker Info Updater Error: {e}')
                self.stdout.flush()


            # Clean up old docker containers — guarded on its
            # own: a transient "database is locked" here must
            # degrade to a skipped sweep, not kill the monitor
            try:
                DockerContainer.objects.filter(synced_at__lt=timezone.now() - timedelta(minutes=5)).delete()
            except Exception as e:
                self.stdout.write(f'Docker Info Updater Error: {e}')
                self.stdout.flush()


            # Per-VM CPU/RAM from cAdvisor — one call per pass;
            # stopped VMs get their numbers cleared inside
            try:
                if numCores is None:
                    machine = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/machine', timeout=5).json()
                    numCores = machine.get('num_cores') or 1
                dockerPayload = requests.get(f'http://{CADVISOR_HOST}:{CADVISOR_PORT}/api/v1.3/docker', timeout=5).json()
                update_vm_usage(parse_cadvisor_docker(dockerPayload, numCores))
            except Exception as e:
                self.stdout.write(f'VM Usage Updater Error: {e}')
                self.stdout.flush()


            # Disk sweep every ~5 minutes, in its own thread —
            # the du must never stall the 3-second sync. The
            # is_alive guard prevents overlapping sweeps.
            if time.monotonic() - lastDiskRun >= DISK_REFRESH_SECONDS and (diskThread is None or not diskThread.is_alive()):
                lastDiskRun = time.monotonic()
                diskThread = threading.Thread(target=refresh_disk_usage, daemon=True)
                diskThread.start()

            if options['once']:
                self.stdout.write(self.style.SUCCESS('Single pass done'))
                break
