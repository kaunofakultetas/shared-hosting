############################################################
#  [*] Portforwarder contract tests — rendering, saving,
#      reloading
#
#  generate_caddyfile is tested as the pure function it is;
#  the route tests pin the plain-JSON body contract and the
#  reload-failure → 500 that drives the backend's rollback.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

import os
import unittest
from unittest.mock import patch

from app.portforwarder.portforwarder_updater import PortforwarderUpdater
from tests.helpers import fake_process, make_client


FORWARD = {'id': 5, 'virtualserverid': 7, 'publicport': 30005, 'internalport': 3000}








############################################################
# GeneratePortforwarderConfigTests
############################################################

class GeneratePortforwarderConfigTests(unittest.TestCase):

    def render(self, forwards):
        return PortforwarderUpdater().generate_caddyfile(forwards)

    def test_one_forward_renders_one_listener(self):
        content = self.render([FORWARD])
        self.assertIn('# Port forward ID: 5', content)
        self.assertIn(':30005 {', content)
        self.assertIn('proxy hosting-users-dind-7:3000', content)
        self.assertIn('layer4 {', content)

    def test_multiple_forwards_render_multiple_listeners(self):
        content = self.render([FORWARD, {'id': 6, 'virtualserverid': 12, 'publicport': 30042, 'internalport': 8080}])
        self.assertIn(':30005 {', content)
        self.assertIn(':30042 {', content)
        self.assertIn('proxy hosting-users-dind-12:8080', content)

    def test_empty_table_renders_no_layer4_block(self):
        # The banner alone is the whole config — reloading it
        # closes every listener
        content = self.render([])
        self.assertNotIn('layer4', content)
        self.assertNotIn('{', content)   # the banner carries no config at all
        self.assertIn('automatically generated', content)

    def test_values_are_coerced_to_integers(self):
        # Ports and the VM id are spliced into config text —
        # string digits must render as clean integers, and
        # anything non-numeric must raise instead of rendering
        content = self.render([{'id': '5', 'virtualserverid': '7', 'publicport': '30005', 'internalport': '3000'}])
        self.assertIn(':30005 {', content)
        self.assertIn('proxy hosting-users-dind-7:3000', content)

        with self.assertRaises(ValueError):
            self.render([{**FORWARD, 'publicport': '30005 }\n:443 {'}])

    def test_save_writes_to_the_configured_location(self):
        target = '/dev/shm/test-portforwarder-caddyfile'
        with patch.dict(os.environ, {'PORTFORWARDER_CADDYFILE_LOCATION': target}):
            PortforwarderUpdater().save_caddyfile('rendered content')
        try:
            with open(target) as f:
                self.assertEqual(f.read(), 'rendered content')
        finally:
            os.remove(target)








############################################################
# UpdatePortforwarderConfigRouteTests
############################################################

class UpdatePortforwarderConfigRouteTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def post_forwards(self, reloadReturncode):
        with patch.dict(os.environ, {'PORTFORWARDER_CADDYFILE_LOCATION': '/dev/shm/test-portforwarder-route'}), \
             patch('app.portforwarder.portforwarder_updater.Popen', return_value=fake_process(reloadReturncode)) as popenMock:
            response = self.client.post('/api/updateportforwarderconfig', json={'portforwards': [FORWARD]})
        if os.path.exists('/dev/shm/test-portforwarder-route'):
            os.remove('/dev/shm/test-portforwarder-route')
        return response, popenMock

    def test_plain_json_body_renders_and_reloads(self):
        response, popenMock = self.post_forwards(reloadReturncode=0)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['message'], 'Portforwarder config updated')
        popenMock.assert_called_once_with(
            ['docker', 'exec', 'hosting-users-portforwarder', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'])

    def test_failed_reload_is_500_so_the_backend_rolls_back(self):
        response, _ = self.post_forwards(reloadReturncode=1)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()['error'], 'Portforwarder reload failed')
