############################################################
#  [*] Status contract tests — the docker ps reshaping
#
#  The monitor stores these fields verbatim and the UI
#  renders them — the legacy CLI shape is a contract.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

import json
import time
import unittest
from unittest.mock import patch

from tests.helpers import fake_response, make_client








############################################################
# StatusValidationTests
############################################################

class StatusValidationTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def test_invalid_name_is_400(self):
        response = self.client.get('/api/status/BAD_NAME')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Invalid container name', response.get_json()['error'])

    def test_non_dind_name_is_400(self):
        response = self.client.get('/api/status/abc')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['error'], 'abc is not a VM container name')








############################################################
# StatusReshapingTests
############################################################
#
# One fake Docker-API container in, the legacy CLI fields
# out. The fixtures pick values that pin every branch of the
# reshaping: port notations, volume counting, label joining,
# command quoting and the (real) UTC timestamp.
############################################################

class StatusReshapingTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    @staticmethod
    def api_container(**overrides):
        container = {
            'Id': 'abc123',
            'Names': ['/web-1'],
            'Image': 'nginx:alpine',
            'Command': 'nginx -g daemon off;',
            'Created': 0,                      # epoch → deterministic UTC string
            'State': 'running',
            'Status': 'Up 2 hours',
            'Labels': {'com.docker.compose.project': 'web', 'x': 'y'},
            'NetworkSettings': {'Networks': {'net-a': {}, 'net-b': {}}},
            'Ports': [
                {'IP': '0.0.0.0', 'PublicPort': 8080, 'PrivatePort': 80, 'Type': 'tcp'},
                {'IP': '::', 'PublicPort': 8080, 'PrivatePort': 80, 'Type': 'tcp'},
                {'PrivatePort': 5432, 'Type': 'tcp'},
            ],
            'Mounts': [
                {'Type': 'bind', 'Source': '/host/data'},
                {'Type': 'volume', 'Source': '/var/lib/docker/volumes/x'},
            ],
        }
        container.update(overrides)
        return container

    def fetch_host(self, containers):
        with patch('app.status.routes.requests_unixsocket.Session') as sessionMock:
            sessionMock.return_value.get.return_value = fake_response(200, json.dumps(containers))
            return self.client.get('/api/status/host')

    def test_legacy_shape(self):
        payload = self.fetch_host([self.api_container()]).get_json()
        container = payload['containers'][0]

        self.assertEqual(container['Names'], 'web-1')                       # leading / stripped
        self.assertEqual(container['Command'], '"nginx -g daemon off;"')    # CLI quoting
        self.assertEqual(container['Labels'], 'com.docker.compose.project=web,x=y')
        self.assertEqual(container['Networks'], 'net-a,net-b')
        self.assertEqual(container['Ports'],
                         '0.0.0.0:8080->80/tcp, [::]:8080->80/tcp, 5432/tcp')
        self.assertEqual(container['Mounts'], '/host/data')                 # volumes hidden...
        self.assertEqual(container['LocalVolumes'], '1')                    # ...but counted
        self.assertEqual(container['Size'], 'N/A')
        self.assertEqual(container['CreatedAt'], '1970-01-01 00:00:00 +0000 UTC')   # real UTC

    def test_running_for_buckets(self):
        now = time.time()
        cases = [
            (now - 3 * 86400, 'days ago'),
            (now - 2 * 3600, 'hours ago'),
            (now - 5 * 60, 'minutes ago'),
            (now - 10, 'Less than a minute ago'),
        ]
        for created, expected in cases:
            payload = self.fetch_host([self.api_container(Created=created)]).get_json()
            self.assertIn(expected, payload['containers'][0]['RunningFor'])

    def test_vm_path_uses_the_dockersocket_proxy_with_the_id_cookie(self):
        with patch('app.status.routes.requests.get') as getMock:
            getMock.return_value = fake_response(200, json.dumps([]))
            response = self.client.get('/api/status/hosting-users-dind-133')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['containers'], [])
        args, kwargs = getMock.call_args
        self.assertIn('hosting-control-dockersocket', args[0])
        self.assertEqual(kwargs['cookies'], {'virtual-server-id': '133'})

    def test_upstream_error_passes_through(self):
        with patch('app.status.routes.requests.get') as getMock:
            getMock.return_value = fake_response(500, 'boom')
            response = self.client.get('/api/status/hosting-users-dind-133')

        self.assertIn('Error from hosting-users-dind-133: 500', response.get_json()['error'])
