############################################################
#  [*] Dashboard contract tests — the admin widgets' data
#
#  The admin gate on all three endpoints, the totals' counting
#  rules, the activity feed shape, and the no-leak guarantee
#  when cAdvisor is unreachable.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
############################################################

from unittest.mock import patch

import requests
from django.test import TestCase

from control.tests.helpers import create_host_row, create_system_user, create_vm, login
from control.hosting.models import DomainName
from control.users.models import RecentActivity








############################################################
# DashboardAuthTests
############################################################

class DashboardAuthTests(TestCase):

    ENDPOINTS = ['/api/dashboard/system', '/api/dashboard/recentactivity', '/api/dashboard/hostingsystem']

    def test_anonymous_and_non_admin_are_401(self):
        create_system_user()
        for endpoint in self.ENDPOINTS:
            self.assertEqual(self.client.get(endpoint).status_code, 401, endpoint)

        login(self.client, 'user@test.local', 'test-pass-8')
        for endpoint in self.ENDPOINTS:
            self.assertEqual(self.client.get(endpoint).status_code, 401, endpoint)








############################################################
# HostingSystemTests
############################################################

class HostingSystemTests(TestCase):

    def test_counting_rules(self):
        create_host_row()
        admin = create_system_user(email='admin@test.local', admin=True)
        user = create_system_user()

        runningVm = create_vm(user)
        create_vm(user, enabled=False)
        create_vm(user, deleted=True)          # deleted: not counted at all
        DomainName.objects.create(virtual_server=runningVm, domain_name='one.test.lt')

        login(self.client, 'admin@test.local', 'test-pass-8')
        payload = self.client.get('/api/dashboard/hostingsystem').json()

        # The HOST row (id 0) never counts as a virtual server
        self.assertEqual(payload, {'users': 2, 'virtualservers_running': 1,
                                   'virtualservers_total': 2, 'domains': 1})








############################################################
# DashboardActivityTests
############################################################

class DashboardActivityTests(TestCase):

    def test_five_newest_with_deleted_user_label(self):
        admin = create_system_user(email='admin@test.local', admin=True)
        login(self.client, 'admin@test.local', 'test-pass-8')

        # After login (which logs its own activity row), so
        # these are the newest five
        for i in range(6):
            RecentActivity.objects.create(user=admin, message=f'event {i}')
        RecentActivity.objects.create(user=None, message='ghost event')

        rows = self.client.get('/api/dashboard/recentactivity').json()

        self.assertEqual(len(rows), 5)
        self.assertEqual(rows[0]['message'], 'ghost event')      # newest first
        self.assertEqual(rows[0]['email'], 'Deleted User')       # detached author
        self.assertTrue(all(set(row) == {'log_id', 'email', 'message', 'time'} for row in rows))








############################################################
# SystemEndpointTests
############################################################

class SystemEndpointTests(TestCase):

    @patch('control.dashboard.api.dashboard_views.requests.get',
           side_effect=requests.ConnectionError('secret internal detail'))
    def test_cadvisor_down_is_a_generic_500(self, getMock):
        create_system_user(email='admin@test.local', admin=True)
        login(self.client, 'admin@test.local', 'test-pass-8')

        response = self.client.get('/api/dashboard/system')
        self.assertEqual(response.status_code, 500)

        # Generic message only — internals never reach the client
        self.assertEqual(response.json()['message'], 'Failed to connect to cAdvisor')
        self.assertNotIn('secret internal detail', response.content.decode())
