############################################################
#  [*] Caddy contract tests — rendering, saving, reloading
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

from app.caddy.caddyfile_updater import CaddyfileUpdater
from tests.helpers import fake_process, make_client


DOMAIN = {'id': 5, 'virtualserverid': 7, 'domainname': 'mano.test.lt', 'iscloudflare': 0, 'ssl': 0}








############################################################
# GenerateCaddyfileTests
############################################################

class GenerateCaddyfileTests(unittest.TestCase):

    def render(self, **overrides):
        return CaddyfileUpdater().generate_caddyfile([{**DOMAIN, **overrides}])

    def test_plain_http_domain(self):
        content = self.render()
        self.assertIn('# DNS ID: 5', content)
        self.assertIn('http://mano.test.lt {', content)
        self.assertIn('reverse_proxy http://hosting-users-dind-7:80', content)
        self.assertIn('header_up X-Forwarded-For {remote_host}', content)
        self.assertNotIn('tls', content.split('http://mano.test.lt')[1].split('}')[0])

    def test_ssl_domain_gets_acme_tls(self):
        content = self.render(ssl=1)
        self.assertIn('\nmano.test.lt {', content)          # https block, no http:// prefix
        self.assertIn('tls admin@knf.vu.lt', content)

    def test_cloudflare_domain(self):
        content = self.render(iscloudflare=1, ssl=1)
        self.assertIn('tls internal', content)              # Cloudflare terminates public TLS
        self.assertIn('@block_non_cloudflare', content)
        self.assertIn('header_up X-Forwarded-For {http.request.header.X-Forwarded-For}', content)

    def test_shared_blocks_always_present(self):
        content = self.render()
        self.assertIn('(cloudflare) {', content)            # the IP allowlist snippet
        self.assertIn(':80 {', content)                     # the catch-all
        self.assertIn('handle_errors 502', content)

    def test_save_writes_to_the_configured_location(self):
        target = '/dev/shm/test-caddyfile'
        with patch.dict(os.environ, {'CADDYFILE_LOCATION': target}):
            CaddyfileUpdater().save_caddyfile('rendered content')
        try:
            with open(target) as f:
                self.assertEqual(f.read(), 'rendered content')
        finally:
            os.remove(target)








############################################################
# UpdateCaddyConfigRouteTests
############################################################

class UpdateCaddyConfigRouteTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def post_domains(self, reloadReturncode):
        with patch.dict(os.environ, {'CADDYFILE_LOCATION': '/dev/shm/test-caddyfile-route'}), \
             patch('app.caddy.caddyfile_updater.Popen', return_value=fake_process(reloadReturncode)) as popenMock:
            response = self.client.post('/api/updatecaddyconfig', json={'domains': [DOMAIN]})
        if os.path.exists('/dev/shm/test-caddyfile-route'):
            os.remove('/dev/shm/test-caddyfile-route')
        return response, popenMock

    def test_plain_json_body_renders_and_reloads(self):
        response, popenMock = self.post_domains(reloadReturncode=0)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['message'], 'Caddy config updated')
        popenMock.assert_called_once_with(
            ['docker', 'exec', 'hosting-users-caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'])

    def test_failed_reload_is_500_so_the_backend_rolls_back(self):
        response, _ = self.post_domains(reloadReturncode=1)
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()['error'], 'Caddy reload failed')
