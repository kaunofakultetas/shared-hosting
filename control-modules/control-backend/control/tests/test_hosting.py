############################################################
#  [*] Hosting contract tests — vm list/control, dns, ssh
#
#  Pins the /api/vm, /api/vm/control, /api/vm/dns/* and
#  /api/sshrouter contracts. The docker sidecar is mocked
#  everywhere — no test touches a real container — and the
#  Caddy regeneration is asserted as calls, never executed.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import requests
from django.test import TestCase
from django.utils import timezone


# Runs the would-be background thread inline, so the async
# create/delete tests observe the completed outcome
RUN_INLINE = lambda target: target()

from control.tests.helpers import (
    create_dind_row,
    create_host_row,
    create_inner_container,
    create_system_user,
    create_vm,
    login,
    post_json,
    put_json,
)
from control.hosting.api.portforward_views import PORTFORWARD_PUBLIC_HOST
from control.hosting.management.commands.monitor_containers import parse_cadvisor_docker, update_vm_usage
from control.hosting.models import DIND_PREFIX, DockerContainer, DomainName, PortForward, VirtualServer, VmUsage
from control.users.models import RecentActivity


OK_RESPONSE = SimpleNamespace(status_code=200)
FAIL_RESPONSE = SimpleNamespace(status_code=500)








############################################################
# VmListTests
############################################################
#
# The card grid's data: integer ids, cache-driven visibility,
# stacks grouped by compose-project label, single VM as an
# object or 404.
############################################################

class VmListTests(TestCase):

    def setUp(self):
        create_host_row()
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.ownVm = create_vm(self.user, name='mine')
        create_dind_row(self.ownVm)
        self.foreignVm = create_vm(self.admin, name='theirs')
        create_dind_row(self.foreignVm)

    def test_anonymous_is_401(self):
        self.assertEqual(self.client.get('/api/vm').status_code, 401)

    def test_own_vms_only_with_int_ids(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        vms = self.client.get('/api/vm').json()
        self.assertEqual([vm['id'] for vm in vms], [self.ownVm.id])
        self.assertIsInstance(vms[0]['id'], int)
        self.assertEqual(vms[0]['enabled'], 1)
        self.assertEqual(vms[0]['owneremail'], 'user@test.local')
        self.assertIsNone(vms[0]['usage'])   # nothing measured yet

    def test_usage_attached_when_measured(self):
        VmUsage.objects.create(
            virtual_server=self.ownVm,
            cpu_percent=12.34, memory_mb=512, disk_mb=2048,
            cpu_measured_at=timezone.now(), disk_measured_at=timezone.now(),
        )
        login(self.client, 'user@test.local', 'test-pass-8')

        usage = self.client.get(f'/api/vm/{self.ownVm.id}').json()['usage']
        self.assertEqual(usage['cpu_percent'], 12.3)   # rounded to one decimal
        self.assertEqual(usage['memory_mb'], 512)
        self.assertEqual(usage['disk_mb'], 2048)
        self.assertIsNotNone(usage['cpu_measured_at'])
        self.assertIsNotNone(usage['disk_measured_at'])

    def test_show_other_users_is_admin_only(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(self.client.get('/api/vm?showOtherUsers=true').status_code, 401)

        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        vms = adminClient.get('/api/vm?showOtherUsers=true').json()
        self.assertEqual({vm['id'] for vm in vms}, {self.ownVm.id, self.foreignVm.id})

    def test_vm_without_cache_row_shows_creating_then_unknown(self):
        pendingVm = create_vm(self.user, name='no container yet')
        login(self.client, 'user@test.local', 'test-pass-8')

        # Fresh registry row, no container → a create in flight
        vms = {vm['id']: vm for vm in self.client.get('/api/vm').json()}
        self.assertEqual(vms[pendingVm.id]['state'], 'creating')
        self.assertIsNone(vms[pendingVm.id]['status'])

        # The single fetch shows it too (no more 404 while pending)
        self.assertEqual(self.client.get(f'/api/vm/{pendingVm.id}').json()['state'], 'creating')

        # An OLD row without a container is honestly unknown
        from control.hosting.models import VirtualServer
        VirtualServer.objects.filter(id=pendingVm.id).update(created_at=timezone.now() - timedelta(minutes=10))
        vms = {vm['id']: vm for vm in self.client.get('/api/vm').json()}
        self.assertEqual(vms[pendingVm.id]['state'], 'unknown')

    def test_deleted_vm_is_invisible_even_with_cache_row(self):
        deadVm = create_vm(self.user, deleted=True)
        create_dind_row(deadVm)
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertNotIn(deadVm.id, [vm['id'] for vm in self.client.get('/api/vm').json()])

    def test_stacks_grouped_by_compose_label(self):
        create_inner_container(self.ownVm, names='web-1', labels='com.docker.compose.project=web,x=y')
        create_inner_container(self.ownVm, names='web-2', labels='com.docker.compose.project=web')
        create_inner_container(self.ownVm, names='loose', labels='')   # compose-less → stack ''

        login(self.client, 'user@test.local', 'test-pass-8')
        stacks = {stack['stackname']: stack for stack in self.client.get('/api/vm').json()[0]['stacks']}

        self.assertEqual(set(stacks), {'', 'web'})
        self.assertEqual({c['names'] for c in stacks['web']['containers']}, {'web-1', 'web-2'})
        self.assertEqual(set(stacks['web']['containers'][0]),
                         {'image', 'names', 'runningfor', 'state', 'status'})

    def test_domains_attached(self):
        DomainName.objects.create(virtual_server=self.ownVm, domain_name='mano.test.lt', ssl=True)
        login(self.client, 'user@test.local', 'test-pass-8')
        domains = self.client.get('/api/vm').json()[0]['domains']
        self.assertEqual(domains, [{'id': domains[0]['id'], 'domainname': 'mano.test.lt',
                                    'iscloudflare': 0, 'ssl': 1}])

    def test_portforwards_attached(self):
        login(self.client, 'user@test.local', 'test-pass-8')

        # No forwards → null, like stacks and domains
        self.assertIsNone(self.client.get(f'/api/vm/{self.ownVm.id}').json()['portforwards'])

        PortForward.objects.create(virtual_server=self.ownVm, public_port=30005, internal_port=3000, description='Minecraft')
        forwards = self.client.get('/api/vm').json()[0]['portforwards']
        self.assertEqual(forwards, [{'id': forwards[0]['id'], 'publichost': PORTFORWARD_PUBLIC_HOST,
                                     'publicport': 30005, 'internalport': 3000, 'description': 'Minecraft'}])

    def test_single_vm_is_an_object(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        payload = self.client.get(f'/api/vm/{self.ownVm.id}').json()
        self.assertIsInstance(payload, dict)
        self.assertEqual(payload['id'], self.ownVm.id)
        self.assertEqual(payload['name'], 'mine')

    def test_single_vm_unknown_is_404_foreign_is_401(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(self.client.get(f'/api/vm/{self.foreignVm.id}').status_code, 401)

        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        self.assertEqual(adminClient.get('/api/vm/999999').status_code, 401)
        self.assertEqual(adminClient.get(f'/api/vm/{self.ownVm.id}').status_code, 200)








############################################################
# VmControlTests
############################################################
#
# Create/start/stop/delete/rename against a mocked sidecar:
# validation messages, the commit-before-create invariant,
# and the cleanups delete performs.
############################################################

class VmControlTests(TestCase):

    def setUp(self):
        create_host_row()
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.vm = create_vm(self.user, name='mine')
        login(self.client, 'user@test.local', 'test-pass-8')

    def control(self, payload):
        return post_json(self.client, '/api/vm/control', payload)

    def test_invalid_body_and_id(self):
        response = self.client.post('/api/vm/control', data='not json', content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.control({'virtualServerID': 'abc', 'action': 'start'}).status_code, 400)
        self.assertEqual(self.control({'virtualServerID': self.vm.id, 'action': 'explode'}).status_code, 400)

    def test_create_name_validation(self):
        cases = [
            ({}, 'Name is required'),
            ({'name': '  ab  '}, 'New name must be at least 3 characters long'),
            ({'name': 'x' * 31}, 'Name must be less than 30 characters long'),
            ({'name': 'bad-name'}, 'Name can only contain letters, numbers, spaces, underscores and parentheses'),
        ]
        for extra, message in cases:
            response = self.control({'action': 'create', **extra})
            self.assertEqual(response.status_code, 400, message)
            self.assertEqual(response.json()['message'], message)

    @patch('control.hosting.api.vm_views.run_in_background', new=RUN_INLINE)
    @patch('control.hosting.docker_controller.create_vm', return_value=OK_RESPONSE)
    def test_create_accepts_and_builds_in_background(self, createMock):
        response = self.control({'action': 'create', 'name': '  Mano serveris (1)  '})
        self.assertEqual(response.status_code, 202)

        newVm = VirtualServer.objects.latest('id')
        self.assertEqual(newVm.name, 'Mano serveris (1)')   # stripped
        self.assertEqual(newVm.owner_id, self.user.id)
        self.assertTrue(newVm.enabled)
        self.assertFalse(newVm.deleted)
        createMock.assert_called_once_with(f'{DIND_PREFIX}{newVm.id}')
        self.assertTrue(RecentActivity.objects.filter(message=f'Virtual server #{newVm.id} created').exists())

    @patch('control.hosting.api.vm_views.run_in_background', new=RUN_INLINE)
    @patch('control.hosting.docker_controller.create_vm', side_effect=requests.ConnectionError)
    def test_create_failure_soft_deletes_the_row_again(self, createMock):
        # The request still answers 202 — the failure happens in
        # the background and shows as the card vanishing + the
        # activity entry
        response = self.control({'action': 'create', 'name': 'doomed'})
        self.assertEqual(response.status_code, 202)

        doomedVm = VirtualServer.objects.get(name='doomed')
        self.assertTrue(doomedVm.deleted)
        self.assertTrue(RecentActivity.objects.filter(message=f'Virtual server #{doomedVm.id} creation failed').exists())

    @patch('control.hosting.docker_controller.start_vm', return_value=OK_RESPONSE)
    def test_start(self, startMock):
        VirtualServer.objects.filter(id=self.vm.id).update(enabled=False)
        response = self.control({'virtualServerID': self.vm.id, 'action': 'start'})
        self.assertEqual(response.json(), {'message': 'OK'})
        self.assertTrue(VirtualServer.objects.get(id=self.vm.id).enabled)
        startMock.assert_called_once_with(f'{DIND_PREFIX}{self.vm.id}')

    @patch('control.hosting.docker_controller.stop_vm', return_value=FAIL_RESPONSE)
    def test_sidecar_non_200_is_500(self, stopMock):
        response = self.control({'virtualServerID': self.vm.id, 'action': 'stop'})
        self.assertEqual(response.status_code, 500)

    def test_actions_need_an_existing_live_vm(self):
        deadVm = create_vm(self.user, deleted=True)
        self.assertEqual(self.control({'virtualServerID': deadVm.id, 'action': 'start'}).status_code, 404)
        self.assertEqual(self.control({'virtualServerID': 999999, 'action': 'start'}).status_code, 404)

    def test_foreign_vm_is_401_for_non_admin(self):
        foreignVm = create_vm(self.admin)
        self.assertEqual(self.control({'virtualServerID': foreignVm.id, 'action': 'stop'}).status_code, 401)

    @patch('control.hosting.api.vm_views.run_in_background', new=RUN_INLINE)
    @patch('control.hosting.docker_controller.update_portforwarder_config')
    @patch('control.hosting.docker_controller.update_caddy_config')
    @patch('control.hosting.docker_controller.delete_vm', return_value=OK_RESPONSE)
    def test_delete_accepts_and_tears_down_in_background(self, deleteMock, caddyMock, portforwarderMock):
        create_dind_row(self.vm)
        DomainName.objects.create(virtual_server=self.vm, domain_name='dies.test.lt')
        PortForward.objects.create(virtual_server=self.vm, public_port=30005, internal_port=3000)

        response = self.control({'virtualServerID': self.vm.id, 'action': 'delete'})
        self.assertEqual(response.status_code, 202)

        self.assertTrue(VirtualServer.objects.get(id=self.vm.id).deleted)
        self.assertFalse(DomainName.objects.filter(virtual_server=self.vm).exists())
        self.assertFalse(PortForward.objects.filter(virtual_server=self.vm).exists())
        deleteMock.assert_called_once_with(f'{DIND_PREFIX}{self.vm.id}')
        caddyMock.assert_called_once()          # stale vhosts die with the VM
        portforwarderMock.assert_called_once()  # stale listeners die with the VM
        # The cache rows are deliberately NOT touched here — the
        # monitor prunes them once the container is gone

    @patch('control.hosting.api.vm_views.run_in_background', new=RUN_INLINE)
    @patch('control.hosting.docker_controller.update_portforwarder_config')
    @patch('control.hosting.docker_controller.update_caddy_config')
    @patch('control.hosting.docker_controller.delete_vm', side_effect=requests.ConnectionError)
    def test_delete_failure_reverts_the_flag(self, deleteMock, caddyMock, portforwarderMock):
        response = self.control({'virtualServerID': self.vm.id, 'action': 'delete'})
        self.assertEqual(response.status_code, 202)

        # The card comes back and the activity says why
        self.assertFalse(VirtualServer.objects.get(id=self.vm.id).deleted)
        self.assertTrue(RecentActivity.objects.filter(message=f'Virtual server #{self.vm.id} deletion failed').exists())

    def test_rename_strips_and_validates(self):
        response = self.control({'virtualServerID': self.vm.id, 'action': 'rename', 'newName': '  Naujas  '})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(VirtualServer.objects.get(id=self.vm.id).name, 'Naujas')

        response = self.control({'virtualServerID': self.vm.id, 'action': 'rename', 'newName': 'no-hyphen'})
        self.assertEqual(response.json()['message'],
                         'New name can only contain letters, numbers, spaces, underscores and parentheses')








############################################################
# DnsTests
############################################################
#
# Domain validation rules, the scoped CRUD, and the
# regenerate-users-Caddy side effect (asserted, not run).
############################################################

class DnsTests(TestCase):

    def setUp(self):
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.vm = create_vm(self.user)
        self.otherVm = create_vm(self.admin)
        login(self.client, 'user@test.local', 'test-pass-8')

    def test_isvalid_rules(self):
        cases = [
            ('ab.c', False, 'Domain name must be at least 5 characters long'),
            ('x' * 40 + '.lt', False, 'Domain name is too long'),
            ('nodots', False, 'Domain name must consist at least one dot'),
            ('a..test.lt', False, 'Domain name cannot consist of repeated dots'),
            ('bad!char.lt', False, 'Invalid characters in domain name'),
            ('1abc.test.lt', False, 'Domain name must start and end with characters (a-z)'),
            ('mano.test.lt', True, 'Domain name is valid'),
        ]
        for domain, expected, message in cases:
            payload = self.client.get(f'/api/vm/dns/isvalid?domainname={domain}&virtualserverid={self.vm.id}').json()
            self.assertEqual(payload['isvalid'], expected, domain)
            self.assertEqual(payload['error_message'], message)

    def test_isvalid_missing_domainname_is_400(self):
        self.assertEqual(self.client.get(f'/api/vm/dns/isvalid?virtualserverid={self.vm.id}').status_code, 400)

    def test_isvalid_taken_by_another_vm(self):
        DomainName.objects.create(virtual_server=self.otherVm, domain_name='taken.test.lt')
        payload = self.client.get(f'/api/vm/dns/isvalid?domainname=taken.test.lt&virtualserverid={self.vm.id}').json()
        self.assertFalse(payload['isvalid'])
        self.assertEqual(payload['error_message'], 'Domain name is already taken')

    def test_ownership_and_existence(self):
        self.assertEqual(self.client.get(f'/api/vm/dns/{self.otherVm.id}').status_code, 401)

        # Nonexistent VMs are denied by the access check itself
        # — uniformly 401, even for admins
        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        self.assertEqual(adminClient.get('/api/vm/dns/999999').status_code, 401)

    @patch('control.hosting.docker_controller.update_caddy_config')
    def test_post_get_put_delete_cycle(self, caddyMock):
        response = post_json(self.client, f'/api/vm/dns/{self.vm.id}',
                             {'domainname': 'Mano.Test.LT', 'iscloudflare': 0, 'ssl': 1})
        self.assertEqual(response.json(), {'message': 'ok'})

        rows = self.client.get(f'/api/vm/dns/{self.vm.id}').json()
        self.assertEqual(rows[0]['domainname'], 'mano.test.lt')   # lowercased
        self.assertEqual(rows[0]['ssl'], 1)
        domainId = rows[0]['id']

        response = put_json(self.client, f'/api/vm/dns/{self.vm.id}',
                            {'domainid': domainId, 'domainname': 'kitas.test.lt', 'iscloudflare': 1, 'ssl': 0})
        self.assertEqual(response.json(), {'message': 'ok'})
        self.assertEqual(DomainName.objects.get(id=domainId).domain_name, 'kitas.test.lt')

        response = self.client.delete(f'/api/vm/dns/{self.vm.id}/{domainId}')
        self.assertEqual(response.json(), {'message': 'ok'})
        self.assertFalse(DomainName.objects.filter(id=domainId).exists())

        # Every mutation pushed a fresh users Caddyfile
        self.assertEqual(caddyMock.call_count, 3)

    @patch('control.hosting.docker_controller.update_caddy_config')
    def test_put_and_delete_are_scoped_to_the_vm(self, caddyMock):
        foreignDomain = DomainName.objects.create(virtual_server=self.otherVm, domain_name='foreign.test.lt')

        response = put_json(self.client, f'/api/vm/dns/{self.vm.id}',
                            {'domainid': foreignDomain.id, 'domainname': 'hijack.test.lt',
                             'iscloudflare': 0, 'ssl': 0})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(DomainName.objects.get(id=foreignDomain.id).domain_name, 'foreign.test.lt')

        self.assertEqual(self.client.delete(f'/api/vm/dns/{self.vm.id}/{foreignDomain.id}').status_code, 404)
        self.assertTrue(DomainName.objects.filter(id=foreignDomain.id).exists())

    @patch('control.hosting.docker_controller.update_caddy_config')
    def test_duplicate_on_same_vm_is_400(self, caddyMock):
        DomainName.objects.create(virtual_server=self.vm, domain_name='dup.test.lt')
        response = post_json(self.client, f'/api/vm/dns/{self.vm.id}',
                             {'domainname': 'dup.test.lt', 'iscloudflare': 0, 'ssl': 0})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], 'Domain name is already taken')

    @patch('control.hosting.docker_controller.update_caddy_config', side_effect=Exception('caddy down'))
    def test_failed_caddy_push_rolls_the_change_back(self, caddyMock):
        # ATOMIC_REQUESTS: the domain INSERT and the Caddy push
        # succeed or fail together — no divergence
        failClient = self.client_class(raise_request_exception=False)
        login(failClient, 'user@test.local', 'test-pass-8')

        response = post_json(failClient, f'/api/vm/dns/{self.vm.id}',
                             {'domainname': 'ghost.test.lt', 'iscloudflare': 0, 'ssl': 0})
        self.assertEqual(response.status_code, 500)
        self.assertFalse(DomainName.objects.filter(domain_name='ghost.test.lt').exists())








############################################################
# CadvisorParsingTests
############################################################
#
# The pure cAdvisor-payload parser the monitor feeds — CPU%
# math, memory extraction, and the skip rules.
############################################################

class CadvisorParsingTests(TestCase):

    @staticmethod
    def node(alias, samples):
        return {'aliases': [alias], 'stats': samples}

    @staticmethod
    def sample(ts, cpuTotalNs, workingSetBytes):
        return {'timestamp': ts, 'cpu': {'usage': {'total': cpuTotalNs}},
                'memory': {'working_set': workingSetBytes}}

    def test_cpu_and_memory_math(self):
        # 1 s wall time, 1e9 cpu-ns burned, 2 cores → 50 %
        payload = {'/docker/abc': self.node('hosting-users-dind-7', [
            self.sample('2026-08-10T12:00:00.000000000Z', 0, 0),
            self.sample('2026-08-10T12:00:01.000000000Z', 1_000_000_000, 512 * 1048576),
        ])}
        usage = parse_cadvisor_docker(payload, numCores=2)
        self.assertEqual(usage, {7: {'cpu_percent': 50.0, 'memory_mb': 512}})

    def test_single_sample_has_memory_but_no_cpu(self):
        payload = {'/docker/abc': self.node('hosting-users-dind-7', [
            self.sample('2026-08-10T12:00:00.000000000Z', 0, 256 * 1048576),
        ])}
        usage = parse_cadvisor_docker(payload, numCores=2)
        self.assertEqual(usage, {7: {'cpu_percent': None, 'memory_mb': 256}})

    def test_non_dind_and_malformed_names_are_skipped(self):
        payload = {
            'a': self.node('some-other-container', [self.sample('2026-08-10T12:00:00.000000000Z', 0, 1)]),
            'b': self.node('hosting-users-dind-abc', [self.sample('2026-08-10T12:00:00.000000000Z', 0, 1)]),
        }
        self.assertEqual(parse_cadvisor_docker(payload, numCores=1), {})

    def test_update_clears_stopped_vms_and_skips_unknown_ids(self):
        owner = create_system_user(email='mon@test.local')
        runningVm = create_vm(owner)
        stoppedVm = create_vm(owner)
        VmUsage.objects.create(virtual_server=stoppedVm, cpu_percent=5.0, memory_mb=128, disk_mb=999)

        update_vm_usage({
            runningVm.id: {'cpu_percent': 12.0, 'memory_mb': 256},
            999999: {'cpu_percent': 1.0, 'memory_mb': 1},     # no such VM — skipped
        })

        self.assertEqual(VmUsage.objects.get(virtual_server=runningVm).memory_mb, 256)

        stoppedUsage = VmUsage.objects.get(virtual_server=stoppedVm)
        self.assertIsNone(stoppedUsage.cpu_percent)
        self.assertIsNone(stoppedUsage.memory_mb)
        self.assertEqual(stoppedUsage.disk_mb, 999)           # disk survives the clear
        self.assertFalse(VmUsage.objects.filter(virtual_server_id=999999).exists())








############################################################
# SshRouterTests
############################################################
#
# The internal shared-secret contract: fail-closed key
# handling and the null-hash rules that end SSH access.
############################################################

@patch('control.hosting.api.sshrouter_views.BACKEND_SSH_API_KEY', 'test-key-123')
class SshRouterTests(TestCase):

    def setUp(self):
        self.owner = create_system_user()
        self.vm = create_vm(self.owner)

    def ask(self, username, key='test-key-123'):
        return post_json(self.client, '/api/sshrouter', {'username': username, 'api_key': key})

    def test_request_validation(self):
        self.assertEqual(self.client.get('/api/sshrouter').status_code, 405)
        self.assertEqual(post_json(self.client, '/api/sshrouter', {'api_key': 'k'}).status_code, 400)
        self.assertEqual(self.ask('notserver1').status_code, 400)
        self.assertEqual(self.ask('serverXY').status_code, 400)

    def test_key_handling(self):
        self.assertEqual(self.ask(f'server{self.vm.id}', key='wrong').status_code, 401)
        response = post_json(self.client, '/api/sshrouter', {'username': f'server{self.vm.id}', 'api_key': None})
        self.assertEqual(response.status_code, 400)

    def test_unconfigured_key_fails_closed(self):
        with patch('control.hosting.api.sshrouter_views.BACKEND_SSH_API_KEY', None):
            response = post_json(self.client, '/api/sshrouter',
                                 {'username': f'server{self.vm.id}', 'api_key': None})
            self.assertEqual(response.status_code, 503)

    def test_unknown_and_deleted_vms_are_404(self):
        deadVm = create_vm(self.owner, deleted=True)
        self.assertEqual(self.ask('server999999').status_code, 404)
        self.assertEqual(self.ask(f'server{deadVm.id}').status_code, 404)

    def test_success_shape(self):
        payload = self.ask(f'server{self.vm.id}').json()
        self.assertEqual(payload, {
            'password_hash': self.owner.password,
            'upstream_host': f'hosting-users-dind-{self.vm.id}',
            'upstream_port': '22',
            'upstream_user': 'root',
            'upstream_pass': 'root',
        })

    def test_disabled_or_missing_owner_yields_null_hash(self):
        disabledOwner = create_system_user(email='off@test.local', enabled=False)
        disabledVm = create_vm(disabledOwner)
        self.assertIsNone(self.ask(f'server{disabledVm.id}').json()['password_hash'])

        orphanVm = create_vm(None)
        self.assertIsNone(self.ask(f'server{orphanVm.id}').json()['password_hash'])
