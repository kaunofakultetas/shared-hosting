############################################################
#  [*] Auth views — login, register, checkauth
#
#  The authentication surface. Hard wire contracts:
#
#    - /api/login answers JSON with real status codes; error
#      responses carry a machine code (MISSING_EMAIL,
#      INVALID_CREDENTIALS, ...) the login page maps to its
#      own wording
#    - /api/checkauth returns {id, email, admin} and doubles
#      as the Caddy forward_auth target for the :8443 VM
#      tools (with /vm/<id>) and stays cheap on purpose
#    - /api/checkauth/admin is the forward_auth gate for
#      /dbgate/* and /swagger
#
#  POST /api/logout flushes the session server-side — the
#  cookie is HttpOnly, so JavaScript cannot delete it; the
#  login page calls the endpoint on mount instead.
#
#  Used by:
#    - Login.jsx — login + registration forms + the logout
#      call on mount
#    - AuthGuard.jsx — checkauth on every page load
#    - control-caddy Caddyfile — both forward_auth gates
############################################################

import re
from datetime import timedelta

import bcrypt
from django.http import JsonResponse
from django.utils import timezone

from control.common.auth import (
    DUMMY_BCRYPT_HASH,
    admin_required,
    check_user_is_allowed_to_access_vm,
    get_json,
    get_user_by_email,
    log_activity,
    login,
    login_required,
)
from control.users.models import RegistrationCode, SystemUser








############################################################
# login_view
############################################################
#
# POST /api/login — {email, password}. 200 {"message": "OK"}
# on success; failures carry a machine code the login page
# maps to its own wording: 400 MISSING_CREDENTIALS /
# MISSING_EMAIL / MISSING_PASSWORD, 401 INVALID_CREDENTIALS.
#
# Every outcome costs exactly ONE bcrypt: the real check when
# the account exists, the dummy when it does not. Unknown
# email, wrong password and correct-password-but-disabled all
# answer 401 in the same time — timing can enumerate nothing.
#
# Used by:
#   - Login.jsx — maps the codes to its hardcoded English
############################################################

def login_view(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)

    # Preauth checks
    if not postData or (not postData.get('email') and not postData.get('password')):
        return JsonResponse({'message': 'MISSING_CREDENTIALS'}, status=400)

    if not postData.get('email'):
        return JsonResponse({'message': 'MISSING_EMAIL'}, status=400)

    if not postData.get('password'):
        return JsonResponse({'message': 'MISSING_PASSWORD'}, status=400)


    email = postData['email'].strip().lower()
    password = postData['password'].strip()


    # Authentication — exactly one bcrypt on every path. A
    # corrupt stored hash counts as a wrong password instead
    # of a 500.
    thisUser = get_user_by_email(email)
    if thisUser is None:
        # The dummy substitutes for the real check
        bcrypt.checkpw(b'This Only Used to prevent time based user enumeration attack, so doing nothing there.',
                       DUMMY_BCRYPT_HASH.encode())
        return JsonResponse({'message': 'INVALID_CREDENTIALS'}, status=401)

    try:
        passwordOk = bcrypt.checkpw(password.encode(), thisUser.password.encode())
    except ValueError:
        passwordOk = False

    if passwordOk and thisUser.enabled == 1:
        login(request, thisUser)
        log_activity(thisUser.id, f'User {thisUser.email} logged in (IP: {request.headers.get("X-Forwarded-For")})')
        return JsonResponse({'message': 'OK'})

    # Wrong password or disabled account — the real check
    # above already cost the one bcrypt
    return JsonResponse({'message': 'INVALID_CREDENTIALS'}, status=401)








############################################################
# logout_view
############################################################
#
# POST /api/logout — flush the session: the server-side row
# dies and the response expires the HttpOnly cookie. Needs no
# login and always answers OK — logging out an already-dead
# session is a success, not an error.
#
# Used by:
#   - Login.jsx — on mount, so opening /login IS the logout
############################################################

def logout_view(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    request.session.flush()
    return JsonResponse({'message': 'OK'})








############################################################
# register_view
############################################################
#
# POST /api/register — {registrationCode, email, password}.
# The code must be an admin's live one (30 min window); the
# account is created Enabled and the activity is logged under
# the admin who owns the code.
#
# Used by:
#   - Login.jsx — the registration form
#   - QuickRegistrationWidget — shows the admin's live code
############################################################

def register_view(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)

    # Validate input
    if not postData:
        return JsonResponse({'message': 'No data provided'}, status=400)
    if not postData.get('registrationCode'):
        return JsonResponse({'message': 'Registration code is required'}, status=400)
    if not postData.get('email'):
        return JsonResponse({'message': 'Email is required'}, status=400)
    if not postData.get('password'):
        return JsonResponse({'message': 'Password is required'}, status=400)

    # Strip BEFORE the length check and the hash — login strips
    # the typed password, so an unstripped hash could never be
    # matched again (a permanent lockout)
    password = postData['password'].strip()
    if len(password) < 8:
        return JsonResponse({'message': 'Password must be at least 8 characters'}, status=400)


    # Validate email format
    email = postData['email'].strip().lower()
    if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
        return JsonResponse({'message': 'Invalid email format'}, status=400)


    registrationCode = postData['registrationCode'].strip().upper()


    # Check if registration code exists and is valid
    codeRow = RegistrationCode.objects.filter(code=registrationCode, valid_until__gt=timezone.now()).first()
    if codeRow is None:
        return JsonResponse({'message': 'Invalid registration code'}, status=400)
    adminUserId = codeRow.user_id


    # Check if email already exists
    if SystemUser.objects.filter(email=email).exists():
        return JsonResponse({'message': 'Email already exists'}, status=400)


    # Create new user (Enabled by default since they have a valid registration code)
    passwordHash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
    SystemUser.objects.create(email=email, password=passwordHash, admin=False, enabled=True)


    # Log activity under the admin who owns the code
    log_activity(adminUserId, f'New user registered: {email}')

    return JsonResponse({'message': 'Registration successful! You can now login.'}, status=201)








############################################################
# checkauth
############################################################
#
# GET /api/checkauth — who is logged in; the SPA calls it on
# every page load. GET /api/checkauth/vm/<id> additionally
# requires VM ownership — Caddy calls that variant as the
# forward_auth gate of the :8443 VM tools (Dockge, File
# Browser, WebSSH2), including their WebSocket upgrades, so
# it must stay cheap and cookie-only.
#
# Every call bumps LastLogin — it is really "last seen" and
# feeds the users grid and the dashboard.
#
# Used by:
#   - AuthGuard.jsx — the session context around the app
#   - control-caddy Caddyfile — the :8443 forward_auth
############################################################

@login_required
def checkauth(request, virtualServerID=None):

    # Enabled is already enforced by load_user — this stays as
    # defense in depth
    if request.current_user.enabled == 0:
        return JsonResponse({'message': 'Unauthorized'}, status=401)


    # Check if user is allowed to access this virtual server
    if virtualServerID is not None:
        if check_user_is_allowed_to_access_vm(request.current_user, virtualServerID) == False:
            return JsonResponse({'message': 'Unauthorized'}, status=401)


    # User Info
    user_info = {
        'id': request.current_user.id,
        'email': request.current_user.email,
        'admin': request.current_user.admin,
    }


    # Bump "last seen" — but at most once a minute: every SPA
    # page load AND every :8443 forward_auth subrequest lands
    # here, and a write per GET is a lot of writes
    staleBefore = timezone.now() - timedelta(minutes=1)
    SystemUser.objects.filter(id=request.current_user.id).exclude(last_login__gte=staleBefore).update(last_login=timezone.now())
    return JsonResponse(user_info, json_dumps_params={'indent': 4})








############################################################
# checkauth_admin
############################################################
#
# GET /api/checkauth/admin — same body, admins only. Caddy
# calls it as the forward_auth gate of /dbgate/* (and the
# swagger UI).
#
# Used by:
#   - control-caddy Caddyfile — the /dbgate/* forward_auth
############################################################

@admin_required
def checkauth_admin(request):

    # User Info
    user_info = {
        'id': request.current_user.id,
        'email': request.current_user.email,
        'admin': request.current_user.admin,
    }

    # Bump "last seen" — but at most once a minute: every SPA
    # page load AND every :8443 forward_auth subrequest lands
    # here, and a write per GET is a lot of writes
    staleBefore = timezone.now() - timedelta(minutes=1)
    SystemUser.objects.filter(id=request.current_user.id).exclude(last_login__gte=staleBefore).update(last_login=timezone.now())
    return JsonResponse(user_info, json_dumps_params={'indent': 4})
