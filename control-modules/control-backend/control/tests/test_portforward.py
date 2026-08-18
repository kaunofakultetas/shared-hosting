############################################################
#  [*] Port forward contract tests — pool rules, scoped CRUD
#
#  Pins the /api/vm/portforward/* contracts. The docker
#  sidecar is mocked everywhere — the portforwarder
#  regeneration is asserted as calls, never executed. The
#  pool bounds come from the views' own constants, so the
#  suite keeps passing if the range is ever moved.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

from unittest.mock import patch

from django.test import TestCase

from control.tests.helpers import (
    create_system_user,
    create_vm,
    login,
    post_json,
    put_json,
)
from control.hosting.api.portforward_views import (
    MAX_FORWARDS_PER_VM,
    PORTFORWARD_PUBLIC_HOST,
    PORTFORWARD_RANGE_END,
    PORTFORWARD_RANGE_START,
)
from control.hosting.models import PortForward
from control.users.models import RecentActivity


# Two free ports inside the pool — the pool is at least 100
# wide, so START+1/START+2 always exist
PORT_A = PORTFORWARD_RANGE_START + 1
PORT_B = PORTFORWARD_RANGE_START + 2








############################################################
# PortForwardValidationTests
############################################################
#
# The isvalid endpoint: pool bounds, integer coercion, the
# taken check and the edit-mode exclusion.
############################################################

class PortForwardValidationTests(TestCase):

    def setUp(self):
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.vm = create_vm(self.user)
        self.otherVm = create_vm(self.admin)
        login(self.client, 'user@test.local', 'test-pass-8')

    def isvalid(self, publicport, internalport, portforwardid=None):
        url = f'/api/vm/portforward/isvalid?publicport={publicport}&internalport={internalport}'
        if portforwardid is not None:
            url += f'&portforwardid={portforwardid}'
        return self.client.get(url).json()

    def test_isvalid_rules(self):
        cases = [
            ('abc', 80, False, 'Public port must be a number'),
            (PORTFORWARD_RANGE_START - 1, 80, False, f'Public port must be between {PORTFORWARD_RANGE_START} and {PORTFORWARD_RANGE_END}'),
            (PORTFORWARD_RANGE_END + 1, 80, False, f'Public port must be between {PORTFORWARD_RANGE_START} and {PORTFORWARD_RANGE_END}'),
            (PORT_A, 'abc', False, 'Internal port must be a number'),
            (PORT_A, 0, False, 'Internal port must be between 1 and 65535'),
            (PORT_A, 65536, False, 'Internal port must be between 1 and 65535'),
            (PORT_A, 3000, True, 'Port forward is valid'),
        ]
        for publicport, internalport, expected, message in cases:
            payload = self.isvalid(publicport, internalport)
            self.assertEqual(payload['isvalid'], expected, f'{publicport}/{internalport}')
            self.assertEqual(payload['error_message'], message)

    def test_isvalid_missing_parameters_is_400(self):
        self.assertEqual(self.client.get('/api/vm/portforward/isvalid').status_code, 400)
        self.assertEqual(self.client.get(f'/api/vm/portforward/isvalid?publicport={PORT_A}').status_code, 400)

    def test_isvalid_taken_port(self):
        PortForward.objects.create(virtual_server=self.otherVm, public_port=PORT_A, internal_port=80)
        payload = self.isvalid(PORT_A, 3000)
        self.assertFalse(payload['isvalid'])
        self.assertEqual(payload['error_message'], 'Public port is already taken')

    def test_isvalid_excludes_the_row_being_edited(self):
        ownForward = PortForward.objects.create(virtual_server=self.vm, public_port=PORT_A, internal_port=80)

        # Keeping the same public port while editing is valid...
        self.assertTrue(self.isvalid(PORT_A, 8080, portforwardid=ownForward.id)['isvalid'])

        # ...but a garbage exclude id falls back to the safe
        # default: every match counts as taken
        self.assertFalse(self.isvalid(PORT_A, 8080, portforwardid='abc')['isvalid'])

    def test_isvalid_requires_login(self):
        anonymousClient = self.client_class()
        self.assertEqual(anonymousClient.get(f'/api/vm/portforward/isvalid?publicport={PORT_A}&internalport=80').status_code, 401)








############################################################
# PortForwardCrudTests
############################################################
#
# The scoped CRUD, the per-VM quota, the wire shape and the
# regenerate-portforwarder side effect (asserted, not run).
############################################################

class PortForwardCrudTests(TestCase):

    def setUp(self):
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.vm = create_vm(self.user)
        self.otherVm = create_vm(self.admin)
        login(self.client, 'user@test.local', 'test-pass-8')

    def test_ownership_and_existence(self):
        self.assertEqual(self.client.get(f'/api/vm/portforward/{self.otherVm.id}').status_code, 401)

        # Nonexistent VMs are denied by the access check itself
        # — uniformly 401, even for admins
        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        self.assertEqual(adminClient.get('/api/vm/portforward/999999').status_code, 401)

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_post_get_put_delete_cycle(self, portforwarderMock):
        response = post_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': '  Minecraft  '})
        self.assertEqual(response.json(), {'message': 'ok'})

        rows = self.client.get(f'/api/vm/portforward/{self.vm.id}').json()
        self.assertEqual(rows, [{
            'id': rows[0]['id'],
            'virtualserverid': self.vm.id,
            'publichost': PORTFORWARD_PUBLIC_HOST,
            'publicport': PORT_A,
            'internalport': 3000,
            'description': 'Minecraft',   # stripped
        }])
        forwardId = rows[0]['id']

        response = put_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                            {'portforwardid': forwardId, 'publicport': PORT_B, 'internalport': 8080, 'description': ''})
        self.assertEqual(response.json(), {'message': 'ok'})
        self.assertEqual(PortForward.objects.get(id=forwardId).public_port, PORT_B)
        self.assertEqual(PortForward.objects.get(id=forwardId).internal_port, 8080)

        # Editing may also KEEP the same public port
        response = put_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                            {'portforwardid': forwardId, 'publicport': PORT_B, 'internalport': 9090, 'description': ''})
        self.assertEqual(response.json(), {'message': 'ok'})

        response = self.client.delete(f'/api/vm/portforward/{self.vm.id}/{forwardId}')
        self.assertEqual(response.json(), {'message': 'ok'})
        self.assertFalse(PortForward.objects.filter(id=forwardId).exists())

        # Every mutation pushed a fresh portforwarder Caddyfile
        self.assertEqual(portforwarderMock.call_count, 4)

        # And every mutation left an activity row
        self.assertTrue(RecentActivity.objects.filter(message=f'Port forward {PORT_A}→3000 added for virtual server #{self.vm.id}').exists())
        self.assertTrue(RecentActivity.objects.filter(message=f'Port forward {PORT_B}→9090 updated for virtual server #{self.vm.id}').exists())
        self.assertTrue(RecentActivity.objects.filter(message=f'Port forward {PORT_B}→9090 deleted for virtual server #{self.vm.id}').exists())

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_put_and_delete_are_scoped_to_the_vm(self, portforwarderMock):
        foreignForward = PortForward.objects.create(virtual_server=self.otherVm, public_port=PORT_A, internal_port=80)

        response = put_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                            {'portforwardid': foreignForward.id, 'publicport': PORT_B, 'internalport': 22, 'description': ''})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(PortForward.objects.get(id=foreignForward.id).public_port, PORT_A)

        self.assertEqual(self.client.delete(f'/api/vm/portforward/{self.vm.id}/{foreignForward.id}').status_code, 404)
        self.assertTrue(PortForward.objects.filter(id=foreignForward.id).exists())

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_taken_port_is_400(self, portforwarderMock):
        PortForward.objects.create(virtual_server=self.otherVm, public_port=PORT_A, internal_port=80)
        response = post_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': ''})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], 'Public port is already taken')

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_own_other_forward_port_collision_is_400(self, portforwarderMock):
        # Editing forward B onto forward A's port must answer
        # like any taken port — not crash on the constraint
        forwardA = PortForward.objects.create(virtual_server=self.vm, public_port=PORT_A, internal_port=80)
        forwardB = PortForward.objects.create(virtual_server=self.vm, public_port=PORT_B, internal_port=81)

        response = put_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                            {'portforwardid': forwardB.id, 'publicport': PORT_A, 'internalport': 81, 'description': ''})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], 'Public port is already taken')

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_quota_per_vm(self, portforwarderMock):
        for offset in range(MAX_FORWARDS_PER_VM):
            PortForward.objects.create(virtual_server=self.vm, public_port=PORTFORWARD_RANGE_START + 10 + offset, internal_port=80)

        response = post_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': ''})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], f'Port forward limit reached ({MAX_FORWARDS_PER_VM} per server)')

        # The quota is per VM — another VM still may add
        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        response = post_json(adminClient, f'/api/vm/portforward/{self.otherVm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': ''})
        self.assertEqual(response.status_code, 200)

    @patch('control.hosting.docker_controller.update_portforwarder_config')
    def test_too_long_description_is_400(self, portforwarderMock):
        response = post_json(self.client, f'/api/vm/portforward/{self.vm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': 'x' * 101})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], 'Description is too long')

    @patch('control.hosting.docker_controller.update_portforwarder_config', side_effect=Exception('portforwarder down'))
    def test_failed_portforwarder_push_rolls_the_change_back(self, portforwarderMock):
        # ATOMIC_REQUESTS: the forward INSERT and the
        # portforwarder push succeed or fail together — no
        # divergence
        failClient = self.client_class(raise_request_exception=False)
        login(failClient, 'user@test.local', 'test-pass-8')

        response = post_json(failClient, f'/api/vm/portforward/{self.vm.id}',
                             {'publicport': PORT_A, 'internalport': 3000, 'description': ''})
        self.assertEqual(response.status_code, 500)
        self.assertFalse(PortForward.objects.filter(public_port=PORT_A).exists())
