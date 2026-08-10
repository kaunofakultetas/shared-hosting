############################################################
#  [*] Lifecycle contract tests — start/stop/delete/create
#
#  Every docker/rm/mv invocation is a mocked Popen — the
#  tests assert the exact argv the routes would run and the
#  status codes the backend's callers key on (200 success,
#  400 validation, 500 operation failure).
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

import unittest
from unittest.mock import patch

from tests.helpers import fake_process, make_client








############################################################
# ValidationTests
############################################################

class ValidationTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def test_invalid_names_are_400_everywhere(self):
        for path in ['/api/start/BAD!', '/api/stop/BAD!', '/api/delete/BAD!',
                     '/api/create/BAD!', '/api/cleanup/BAD!']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 400, path)
            self.assertIn('Invalid container name', response.get_json()['error'])

    def test_delete_and_create_require_a_full_dind_name(self):
        for path in ['/api/delete/host', '/api/create/abc-def', '/api/delete/hosting-users-dind-x']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 400, path)
            self.assertIn('is not a VM container name', response.get_json()['error'])








############################################################
# StartStopTests
############################################################

class StartStopTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def test_start_success_and_argv(self):
        with patch('app.virtual_servers.routes.Popen', return_value=fake_process(0)) as popenMock:
            response = self.client.get('/api/start/hosting-users-dind-7')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['message'], 'hosting-users-dind-7 started')
        popenMock.assert_called_once_with(['docker', 'start', 'hosting-users-dind-7'])

    def test_failures_are_500(self):
        with patch('app.virtual_servers.routes.Popen', return_value=fake_process(1)):
            self.assertEqual(self.client.get('/api/start/hosting-users-dind-7').status_code, 500)
            self.assertEqual(self.client.get('/api/stop/hosting-users-dind-7').status_code, 500)
            self.assertEqual(self.client.get('/api/cleanup/hosting-users-dind-7').status_code, 500)

    def test_cleanup_prunes_inside_the_vm(self):
        with patch('app.virtual_servers.routes.Popen', return_value=fake_process(0)) as popenMock:
            self.client.get('/api/cleanup/hosting-users-dind-7')

        popenMock.assert_called_once_with(
            ['docker', 'exec', 'hosting-users-dind-7', 'docker', 'system', 'prune', '-a', '-f', '--volumes'])








############################################################
# DeleteTests
############################################################
#
# The tolerant-steps / strict-outcome design: individual
# failures must not abort (half-broken VMs stay deletable),
# but the container still existing afterwards fails the
# whole operation.
############################################################

class DeleteTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def run_delete(self, stepReturncodes, inspectReturncode):
        # Order: stop, rm, rm -rf, mv, docker inspect
        processes = [fake_process(rc) for rc in stepReturncodes] + [fake_process(inspectReturncode)]
        with patch('app.virtual_servers.routes.Popen', side_effect=processes) as popenMock:
            response = self.client.get('/api/delete/hosting-users-dind-7')
        return response, popenMock

    def test_success_archives_the_data_directory(self):
        response, popenMock = self.run_delete([0, 0, 0, 0], inspectReturncode=1)
        self.assertEqual(response.status_code, 200)

        argvs = [call.args[0] for call in popenMock.call_args_list]
        self.assertEqual(argvs[0][:2], ['docker', 'stop'])
        self.assertEqual(argvs[1][:2], ['docker', 'rm'])
        self.assertEqual(argvs[2][:2], ['rm', '-rf'])
        self.assertTrue(argvs[2][2].endswith('/SERVERS/7/docker'))
        self.assertEqual(argvs[3][0], 'mv')
        self.assertTrue(argvs[3][1].endswith('/SERVERS/7'))
        self.assertIn('/SERVERS/7-deleted-', argvs[3][2])
        self.assertEqual(argvs[4][:2], ['docker', 'inspect'])

    def test_half_broken_vm_is_still_deletable(self):
        # Container already gone: stop and rm fail, inspect
        # confirms absence → the delete still counts as done
        response, _ = self.run_delete([1, 1, 0, 0], inspectReturncode=1)
        self.assertEqual(response.status_code, 200)

    def test_surviving_container_fails_the_operation(self):
        response, _ = self.run_delete([0, 1, 0, 0], inspectReturncode=0)
        self.assertEqual(response.status_code, 500)
        self.assertIn('Failed to delete', response.get_json()['error'])








############################################################
# CreateTests
############################################################

class CreateTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def test_create_argv_pins_the_platform_contract(self):
        with patch('app.virtual_servers.routes.Popen', return_value=fake_process(0)) as popenMock:
            response = self.client.get('/api/create/hosting-users-dind-42')

        self.assertEqual(response.status_code, 200)
        argv = popenMock.call_args.args[0]
        self.assertEqual(argv[:3], ['docker', 'run', '-d'])
        self.assertIn('hosting-users-dind-42', argv)          # --name
        self.assertIn('server42', argv)                       # --hostname
        self.assertIn('--runtime=sysbox-runc', argv)
        self.assertTrue(any(v.endswith('/SERVERS/42/apps:/apps') for v in argv))
        self.assertTrue(any(v.endswith('/SERVERS/42/docker:/var/lib/docker') for v in argv))
        self.assertIn('filtered-users', argv)
        self.assertEqual(argv[-1], 'hosting-dind-ubuntu')

    def test_failed_run_is_500(self):
        with patch('app.virtual_servers.routes.Popen', return_value=fake_process(1)):
            self.assertEqual(self.client.get('/api/create/hosting-users-dind-42').status_code, 500)
