############################################################
#  [*] Usage contract tests — the du sweep
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

import unittest
from unittest.mock import patch

from tests.helpers import fake_process, make_client








############################################################
# DiskUsageTests
############################################################

class DiskUsageTests(unittest.TestCase):

    def setUp(self):
        self.client = make_client()

    def test_unmounted_servers_dir_is_500(self):
        with patch('app.usage.routes.os.path.isdir', return_value=False):
            response = self.client.get('/api/usage/disk')
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.get_json()['message'], 'SERVERS is not mounted')

    def test_only_live_numeric_dirs_are_measured(self):
        # The route iterates sorted() names — STRING order, so
        # '133' is measured before '7'
        listing = ['7', '12-deleted-20260101120000', 'junk', '133']
        duResults = [fake_process(0, b'99999\t/SERVERS/133\n'),
                     fake_process(0, b'12345\t/SERVERS/7\n')]

        with patch('app.usage.routes.os.path.isdir', return_value=True), \
             patch('app.usage.routes.os.listdir', return_value=listing), \
             patch('app.usage.routes.Popen', side_effect=duResults) as popenMock:
            payload = self.client.get('/api/usage/disk').get_json()

        self.assertEqual(payload['usage'], {'133': 99999, '7': 12345})
        measured = [call.args[0][2] for call in popenMock.call_args_list]
        self.assertEqual(measured, ['/SERVERS/133', '/SERVERS/7'])

    def test_unreadable_du_output_is_skipped_not_fatal(self):
        with patch('app.usage.routes.os.path.isdir', return_value=True), \
             patch('app.usage.routes.os.listdir', return_value=['7', '8']), \
             patch('app.usage.routes.Popen', side_effect=[fake_process(1, b''),
                                                          fake_process(0, b'not-a-number\n')]):
            payload = self.client.get('/api/usage/disk').get_json()

        self.assertEqual(payload['usage'], {})
