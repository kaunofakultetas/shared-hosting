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
import time
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from control.hosting import docker_controller
from control.hosting.models import DockerContainer, VirtualServer


DIND_PREFIX = 'hosting-users-dind-'








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
            # non-numeric suffixes are skipped.
            if parentServerID == 0 and container['Names'].startswith(DIND_PREFIX):
                virtualServerID = container['Names'].replace(DIND_PREFIX, '')
                if virtualServerID.isdigit():
                    VirtualServer.objects.get_or_create(
                        id=int(virtualServerID),
                        defaults={'owner': None, 'name': '', 'enabled': True, 'deleted': False},
                    )
                    VirtualServer.objects.filter(id=int(virtualServerID)).update(updated_at=timeNow)

        # Drop this parent's rows that were not in the snapshot
        DockerContainer.objects.filter(parent_server_id=parentServerID).exclude(synced_at=timeNow).delete()








############################################################
# Command
############################################################

class Command(BaseCommand):
    help = 'Polls the docker sidecar every 3 seconds and maintains the containers cache'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Run a single pass and exit (for testing)')


    def handle(self, *args, **options):
        self.stdout.write('Docker monitor started (3 s interval)')

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


            # Clean up old docker containers
            DockerContainer.objects.filter(synced_at__lt=timezone.now() - timedelta(minutes=5)).delete()

            if options['once']:
                self.stdout.write(self.style.SUCCESS('Single pass done'))
                break
