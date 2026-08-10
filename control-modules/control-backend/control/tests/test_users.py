############################################################
#  [*] Users contract tests — auth, account, admin grid
#
#  Pins the wire contract of every /api endpoint this app
#  serves: exact status codes, exact body shapes and the
#  exact reason/message strings the frontend renders. A
#  failing test here means the frontend (or a Caddy
#  forward_auth gate) just broke.
#
#  Convention: one banner per test class; test methods carry
#  descriptive names instead of banners.
#
#  Run inside the container:
#    python3 manage.py test control
############################################################

from datetime import timedelta

import bcrypt
from django.test import TestCase
from django.utils import timezone

from control.tests.helpers import create_system_user, create_vm, login, post_json
from control.users.models import RecentActivity, RegistrationCode, SystemUser








############################################################
# LoginTests
############################################################
#
# The JSON login protocol: machine codes with real status
# codes, one bcrypt per outcome, stripped passwords.
############################################################

class LoginTests(TestCase):

    def setUp(self):
        self.user = create_system_user()

    def test_method_get_is_405(self):
        self.assertEqual(self.client.get('/api/login').status_code, 405)

    def test_missing_credentials(self):
        response = post_json(self.client, '/api/login', {})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['message'], 'MISSING_CREDENTIALS')

    def test_missing_email(self):
        response = post_json(self.client, '/api/login', {'password': 'x'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['message'], 'MISSING_EMAIL')

    def test_missing_password(self):
        response = post_json(self.client, '/api/login', {'email': 'user@test.local'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['message'], 'MISSING_PASSWORD')

    def test_unknown_email(self):
        response = login(self.client, 'ghost@test.local', 'whatever')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['message'], 'INVALID_CREDENTIALS')

    def test_wrong_password(self):
        response = login(self.client, 'user@test.local', 'wrong-password')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['message'], 'INVALID_CREDENTIALS')

    def test_disabled_account_with_correct_password(self):
        create_system_user(email='off@test.local', enabled=False)
        response = login(self.client, 'off@test.local', 'test-pass-8')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['message'], 'INVALID_CREDENTIALS')

    def test_success(self):
        response = login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'message': 'OK'})

        # The session cookie: named "session", HttpOnly
        self.assertIn('session', response.cookies)
        self.assertTrue(response.cookies['session']['httponly'])

    def test_email_case_insensitive_and_password_stripped(self):
        response = login(self.client, '  USER@test.local ', '  test-pass-8  ')
        self.assertEqual(response.status_code, 200)

    def test_success_logs_activity(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertTrue(RecentActivity.objects.filter(user=self.user, message__contains='logged in').exists())








############################################################
# LogoutTests
############################################################

class LogoutTests(TestCase):

    def test_without_session_is_still_ok(self):
        response = self.client.post('/api/logout')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'message': 'OK'})

    def test_kills_the_session(self):
        create_system_user()
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(self.client.get('/api/checkauth').status_code, 200)

        self.client.post('/api/logout')
        self.assertEqual(self.client.get('/api/checkauth').status_code, 401)








############################################################
# CheckauthTests
############################################################
#
# The SPA's session probe AND the Caddy forward_auth target —
# the status code is what grants or denies the :8443 tools.
############################################################

class CheckauthTests(TestCase):

    def setUp(self):
        self.user = create_system_user()
        self.admin = create_system_user(email='admin@test.local', admin=True)

    def test_anonymous_is_401(self):
        self.assertEqual(self.client.get('/api/checkauth').status_code, 401)

    def test_shape_and_types(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        payload = self.client.get('/api/checkauth').json()
        self.assertEqual(payload, {'id': self.user.id, 'email': 'user@test.local', 'admin': 0})

    def test_disabling_a_user_cuts_the_live_session(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        SystemUser.objects.filter(id=self.user.id).update(enabled=False)
        self.assertEqual(self.client.get('/api/checkauth').status_code, 401)

    def test_last_seen_bumped_at_most_once_a_minute(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        self.client.get('/api/checkauth')
        firstSeen = SystemUser.objects.get(id=self.user.id).last_login
        self.assertIsNotNone(firstSeen)

        self.client.get('/api/checkauth')
        self.assertEqual(SystemUser.objects.get(id=self.user.id).last_login, firstSeen)

    def test_admin_gate(self):
        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(self.client.get('/api/checkauth/admin').status_code, 401)

        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        self.assertEqual(adminClient.get('/api/checkauth/admin').status_code, 200)

    def test_vm_gate_owner_and_admin(self):
        ownVm = create_vm(self.user)
        foreignVm = create_vm(self.admin)
        deletedVm = create_vm(self.user, deleted=True)

        login(self.client, 'user@test.local', 'test-pass-8')
        self.assertEqual(self.client.get(f'/api/checkauth/vm/{ownVm.id}').status_code, 200)
        self.assertEqual(self.client.get(f'/api/checkauth/vm/{foreignVm.id}').status_code, 401)
        self.assertEqual(self.client.get(f'/api/checkauth/vm/{deletedVm.id}').status_code, 401)

        adminClient = self.client_class()
        login(adminClient, 'admin@test.local', 'test-pass-8')
        self.assertEqual(adminClient.get(f'/api/checkauth/vm/{ownVm.id}').status_code, 200)
        self.assertEqual(adminClient.get('/api/checkauth/vm/999999').status_code, 401)








############################################################
# RegisterTests
############################################################

class RegisterTests(TestCase):

    def setUp(self):
        self.admin = create_system_user(email='admin@test.local', admin=True)
        self.code = RegistrationCode.objects.create(
            user=self.admin, code='GOODCODE',
            valid_until=timezone.now() + timedelta(minutes=30),
        )

    def register(self, **overrides):
        payload = {'registrationCode': 'GOODCODE', 'email': 'new@test.local', 'password': 'fresh-pass-8'}
        payload.update(overrides)
        return post_json(self.client, '/api/register', payload)

    def test_validation_messages(self):
        cases = [
            ({'registrationCode': ''}, 'Registration code is required'),
            ({'email': ''}, 'Email is required'),
            ({'password': ''}, 'Password is required'),
            ({'password': 'short7!'}, 'Password must be at least 8 characters'),
            ({'email': 'not-an-email'}, 'Invalid email format'),
            ({'registrationCode': 'BADCODE1'}, 'Invalid registration code'),
        ]
        for overrides, message in cases:
            response = self.register(**overrides)
            self.assertEqual(response.status_code, 400, message)
            self.assertEqual(response.json()['message'], message)

    def test_expired_code(self):
        RegistrationCode.objects.filter(id=self.code.id).update(valid_until=timezone.now() - timedelta(minutes=1))
        response = self.register()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['message'], 'Invalid registration code')

    def test_duplicate_email(self):
        create_system_user(email='new@test.local')
        response = self.register()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['message'], 'Email already exists')

    def test_success(self):
        response = self.register(password='  padded-pass-8  ')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['message'], 'Registration successful! You can now login.')

        newUser = SystemUser.objects.get(email='new@test.local')
        self.assertTrue(newUser.enabled)
        self.assertFalse(newUser.admin)

        # Stored hash is of the STRIPPED password — login works
        self.assertTrue(bcrypt.checkpw(b'padded-pass-8', newUser.password.encode()))

        # Activity is logged under the admin who owns the code
        self.assertTrue(RecentActivity.objects.filter(user=self.admin, message__contains='new@test.local').exists())








############################################################
# RegistrationCodeTests
############################################################

class RegistrationCodeTests(TestCase):

    def setUp(self):
        self.admin = create_system_user(email='admin@test.local', admin=True)
        login(self.client, 'admin@test.local', 'test-pass-8')

    def test_non_admin_is_401(self):
        create_system_user(email='plain@test.local')
        plainClient = self.client_class()
        login(plainClient, 'plain@test.local', 'test-pass-8')
        self.assertEqual(plainClient.get('/api/account/registration-code').status_code, 401)

    def test_get_without_code_is_404(self):
        response = self.client.get('/api/account/registration-code')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['message'], 'No registration code found')

    def test_post_creates_and_get_returns(self):
        created = self.client.post('/api/account/registration-code').json()
        self.assertEqual(len(created['code']), 8)
        self.assertEqual(created['code'], created['code'].upper())

        # validUntil is unix epoch seconds ~30 minutes ahead
        secondsAhead = created['validUntil'] - int(timezone.now().timestamp())
        self.assertTrue(1700 < secondsAhead <= 1800)

        fetched = self.client.get('/api/account/registration-code').json()
        self.assertEqual(fetched['code'], created['code'])

    def test_get_purges_expired_codes_globally(self):
        otherAdmin = create_system_user(email='other@test.local', admin=True)
        RegistrationCode.objects.create(
            user=otherAdmin, code='EXPIRED1',
            valid_until=timezone.now() - timedelta(minutes=1),
        )
        self.client.get('/api/account/registration-code')
        self.assertFalse(RegistrationCode.objects.filter(code='EXPIRED1').exists())

    def test_delete(self):
        self.client.post('/api/account/registration-code')
        self.assertEqual(self.client.delete('/api/account/registration-code').status_code, 200)
        self.assertFalse(RegistrationCode.objects.filter(user=self.admin).exists())








############################################################
# ChangePasswordTests
############################################################

class ChangePasswordTests(TestCase):

    def setUp(self):
        self.user = create_system_user()
        login(self.client, 'user@test.local', 'test-pass-8')

    def change(self, current, new):
        return post_json(self.client, '/api/account/change-password',
                         {'currentPassword': current, 'newPassword': new})

    def test_validation(self):
        self.assertEqual(self.change('', 'new-pass-8').status_code, 400)
        self.assertEqual(self.change('test-pass-8', '').status_code, 400)
        self.assertEqual(self.change('test-pass-8', 'short7!').status_code, 400)

    def test_wrong_current_password(self):
        response = self.change('wrong-pass', 'new-pass-8')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()['message'], 'Current password is incorrect')

    def test_success_with_padded_input_round_trips(self):
        response = self.change('  test-pass-8  ', '  fresh-pass-9  ')
        self.assertEqual(response.status_code, 200)

        freshClient = self.client_class()
        self.assertEqual(login(freshClient, 'user@test.local', 'fresh-pass-9').status_code, 200)








############################################################
# AdminUsersTests
############################################################
#
# The grid contract: 200 {"type":"ok"} on success, real
# status codes with {"type":"error","reason":...} otherwise.
############################################################

class AdminUsersTests(TestCase):

    def setUp(self):
        self.admin = create_system_user(email='admin@test.local', admin=True)
        login(self.client, 'admin@test.local', 'test-pass-8')

    def grid(self, payload):
        return post_json(self.client, '/api/admin/users', payload)

    def test_non_admin_is_401(self):
        create_system_user(email='plain@test.local')
        plainClient = self.client_class()
        login(plainClient, 'plain@test.local', 'test-pass-8')
        self.assertEqual(plainClient.get('/api/admin/users').status_code, 401)

    def test_get_shape(self):
        plainUser = create_system_user(email='plain@test.local')
        create_vm(plainUser)
        create_vm(plainUser, deleted=True)   # deleted VMs don't count

        rows = {row['email']: row for row in self.client.get('/api/admin/users').json()}
        row = rows['plain@test.local']
        self.assertEqual(row['servercount'], 1)
        self.assertEqual(row['admin'], 0)
        self.assertEqual(row['enabled'], 1)
        self.assertIsNone(row['lastseen'])   # never seen

    def test_create_ok_and_duplicate_409(self):
        payload = {'action': 'insertupdate', 'id': '', 'email': 'made@test.local',
                   'admin': 0, 'enabled': 1, 'password': 'made-pass-8'}
        self.assertEqual(self.grid(payload).json(), {'type': 'ok'})

        response = self.grid(payload)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['reason'], 'User with this email already exists')

    def test_create_password_policy(self):
        base = {'action': 'insertupdate', 'id': '', 'email': 'p@test.local', 'admin': 0, 'enabled': 1}
        self.assertEqual(self.grid({**base, 'password': ''}).status_code, 400)
        self.assertEqual(self.grid({**base, 'password': 'tiny'}).status_code, 400)

    def test_update_missing_user_404(self):
        response = self.grid({'action': 'insertupdate', 'id': 999999, 'email': 'x@test.local',
                              'admin': 0, 'enabled': 1, 'password': ''})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()['reason'], 'User not found')

    def test_update_without_password_keeps_hash(self):
        target = create_system_user(email='target@test.local')
        oldHash = target.password
        self.grid({'action': 'insertupdate', 'id': target.id, 'email': 'renamed@test.local',
                   'admin': 1, 'enabled': 0, 'password': ''})

        target.refresh_from_db()
        self.assertEqual(target.email, 'renamed@test.local')
        self.assertTrue(target.admin)
        self.assertFalse(target.enabled)
        self.assertEqual(target.password, oldHash)

    def test_delete_self_400(self):
        response = self.grid({'action': 'delete', 'id': self.admin.id})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['reason'], 'Cannot delete yourself')

    def test_delete_with_vms_409(self):
        target = create_system_user(email='target@test.local')
        create_vm(target)
        response = self.grid({'action': 'delete', 'id': target.id})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()['reason'], 'User has virtual servers')

    def test_delete_detaches_history(self):
        target = create_system_user(email='target@test.local')
        create_vm(target, deleted=True)      # soft-deleted VMs don't block
        RecentActivity.objects.create(user=target, message='did something')

        self.assertEqual(self.grid({'action': 'delete', 'id': target.id}).json(), {'type': 'ok'})
        self.assertIsNone(RecentActivity.objects.get(message='did something').user)

    def test_illegal_action_400(self):
        self.assertEqual(self.grid({'action': 'explode'}).status_code, 400)








############################################################
# AccountActivityTests
############################################################

class AccountActivityTests(TestCase):

    def test_anonymous_is_401(self):
        self.assertEqual(self.client.get('/api/account/recentactivity').status_code, 401)

    def test_own_rows_only_newest_first(self):
        user = create_system_user()
        other = create_system_user(email='other@test.local')
        RecentActivity.objects.create(user=user, message='mine first')
        RecentActivity.objects.create(user=other, message='not mine')
        RecentActivity.objects.create(user=user, message='mine second')

        login(self.client, 'user@test.local', 'test-pass-8')
        rows = self.client.get('/api/account/recentactivity').json()

        self.assertEqual([row['message'] for row in rows if 'mine' in row['message']],
                         ['mine second', 'mine first'])
        self.assertTrue(all(row['email'] == 'user@test.local' for row in rows if 'mine' in row['message']))
        self.assertTrue(all(set(row) == {'log_id', 'email', 'message', 'time'} for row in rows))
