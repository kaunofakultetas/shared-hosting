############################################################
#  [*] Test helpers — fixtures the suites share
#
#  Small factories for the objects every contract test needs,
#  plus JSON-body wrappers around the Django test client
#  (the API parses raw JSON bodies, not form data).
#
#  bcrypt uses rounds=4 here — the real views still verify
#  these hashes fine, and the suite stays fast.
#
#  Used by:
#    - test_users.py, test_hosting.py, test_dashboard.py
############################################################

import json

import bcrypt
from django.utils import timezone

from control.hosting.models import DIND_PREFIX, DockerContainer, VirtualServer
from control.users.models import SystemUser








############################################################
# create_system_user
############################################################
#
# One account with a real (fast) bcrypt hash, enabled by
# default — the password STRING is what tests log in with.
#
# Used by:
#   - every suite
############################################################

def create_system_user(email='user@test.local', password='test-pass-8', admin=False, enabled=True):
    passwordHash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=4)).decode()
    return SystemUser.objects.create(email=email, password=passwordHash, admin=admin, enabled=enabled)








############################################################
# create_host_row / create_vm
############################################################
#
# The reserved HOST row (VM ID 0) must exist before any
# cache row can reference parent 0 — mirror of bootstrap_db.
# create_vm makes a plain VM row; visibility in /api/vm
# additionally needs a dind cache row (below).
#
# Used by:
#   - hosting/tests.py, dashboard/tests.py
############################################################

def create_host_row():
    hostRow, _ = VirtualServer.objects.get_or_create(
        id=0,
        defaults={'owner': None, 'name': 'HOST', 'enabled': True, 'deleted': False},
    )
    return hostRow



def create_vm(owner, name='Test server', enabled=True, deleted=False):
    return VirtualServer.objects.create(owner=owner, name=name, enabled=enabled, deleted=deleted)








############################################################
# create_dind_row / create_inner_container
############################################################
#
# Cache rows the monitor would have written: the host-level
# dind row that makes a VM visible in /api/vm, and an
# inner-container row that shows up in the VM's stacks.
#
# Used by:
#   - hosting/tests.py — the vm list shape tests
############################################################

def create_dind_row(vm, state='running', status='Up 2 hours'):
    return DockerContainer.objects.create(
        parent_server_id=0,
        docker_id=f'dind-{vm.id}',
        command='', created_at='', image='hosting-dind-ubuntu',
        labels='', mounts='', names=f'{DIND_PREFIX}{vm.id}',
        networks='', ports='', running_for='',
        size='', state=state, status=status,
        synced_at=timezone.now(),
    )



def create_inner_container(vm, names='web-1', labels='com.docker.compose.project=web', state='running'):
    return DockerContainer.objects.create(
        parent_server=vm,
        docker_id=f'inner-{vm.id}-{names}',
        command='', created_at='', image='nginx:alpine',
        labels=labels, mounts='', names=names,
        networks='', ports='', running_for='2 hours',
        size='', state=state, status='Up 2 hours',
        synced_at=timezone.now(),
    )








############################################################
# post_json / put_json / login
############################################################
#
# The client wrappers: raw-JSON bodies, and the two-line
# login every authenticated test starts with.
#
# Used by:
#   - every suite
############################################################

def post_json(client, path, payload):
    return client.post(path, data=json.dumps(payload), content_type='application/json')



def put_json(client, path, payload):
    return client.put(path, data=json.dumps(payload), content_type='application/json')



def login(client, email, password):
    return post_json(client, '/api/login', {'email': email, 'password': password})
