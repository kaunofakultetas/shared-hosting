############################################################
#  [*] Auth views — login, register, checkauth
#
#  The authentication surface. Hard wire contracts:
#
#    - /api/login answers HTTP 200 plain text, either "OK"
#      or a Lithuanian sentence the login page renders
#      verbatim (it string-matches 'OK')
#    - /api/checkauth returns {id, email, admin} and doubles
#      as the Caddy forward_auth target for the :8443 VM
#      tools (with /vm/<id>) and stays cheap on purpose
#    - /api/checkauth/admin is the forward_auth gate for
#      /dbgate/* and /swagger
#
#  There is NO logout endpoint on purpose — the login page
#  deletes the (non-HttpOnly) session cookie from JavaScript.
#
#  Used by:
#    - Login.jsx — login + registration forms
#    - AuthGuard.jsx — checkauth on every page load
#    - control-caddy Caddyfile — both forward_auth gates
############################################################

import re

import bcrypt
from django.http import HttpResponse, JsonResponse
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
# POST /api/login — {email, password} → plain-text "OK" or a
# Lithuanian error, always HTTP 200. Unknown users and wrong
# passwords take equally long (dummy bcrypt check), so timing
# can't enumerate accounts.
#
# A disabled account is refused with the generic invalid-
# credentials message, so probing can't tell "disabled"
# apart from "wrong password".
#
# Used by:
#   - Login.jsx — string-matches the literal 'OK'
############################################################

def login_view(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)

    # Preauth checks
    if not postData or (not postData.get('email') and not postData.get('password')):
        return HttpResponse('Įveskite El. Pašto adresą ir Slaptažodį.')

    if not postData.get('email'):
        return HttpResponse('Įveskite El. Pašto adresą.')

    if not postData.get('password'):
        return HttpResponse('Įveskite Slaptažodį.')


    email = postData['email'].strip().lower()
    password = postData['password'].strip()


    # Authentication — corrupt stored hashes count as a wrong
    # password instead of a 500
    thisUser = get_user_by_email(email)
    if thisUser is not None:
        try:
            passwordOk = bcrypt.checkpw(password.encode(), thisUser.password.encode())
        except ValueError:
            passwordOk = False

        if passwordOk and thisUser.enabled == 1:
            login(request, thisUser)
            log_activity(thisUser.id, f'User {thisUser.email} logged in (IP: {request.headers.get("X-Forwarded-For")})')
            return HttpResponse('OK')

        if not passwordOk:
            # Dummy check — keep the timing of the success path
            bcrypt.checkpw(b'This Only Used to prevent time based user enumeration attack, so doing nothing there.',
                           DUMMY_BCRYPT_HASH.encode())
        return HttpResponse('El. Paštas ir/arba Slaptažodis neteisingas.')

    else:
        # Dummy check — keep the timing of the success path
        bcrypt.checkpw(b'This Only Used to prevent time based user enumeration attack, so doing nothing there.',
                       DUMMY_BCRYPT_HASH.encode())
        return HttpResponse('El. Paštas ir/arba Slaptažodis neteisingas.')








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
    if len(postData.get('password')) < 6:
        return JsonResponse({'message': 'Password must be at least 6 characters'}, status=400)


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
    passwordHash = bcrypt.hashpw(postData['password'].encode(), bcrypt.gensalt(rounds=12)).decode()
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


    # Update last seen
    SystemUser.objects.filter(id=request.current_user.id).update(last_login=timezone.now())
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

    # Update last seen
    SystemUser.objects.filter(id=request.current_user.id).update(last_login=timezone.now())
    return JsonResponse(user_info, json_dumps_params={'indent': 4})
