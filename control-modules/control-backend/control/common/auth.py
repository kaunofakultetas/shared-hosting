############################################################
#  [*] Session auth — hand-rolled, no django.contrib.auth
#
#  The session cookie: named "session", HttpOnly (logout is
#  a real endpoint, not JavaScript), browser-session
#  lifetime. Passwords are bcrypt hashes. The session
#  stores only the user's ID; the user row is re-read from
#  the DB on every request, so permission/enabled changes
#  apply immediately.
#
#  load_user only accepts Enabled accounts, so disabling a
#  user cuts off their live session everywhere at once.
############################################################

import json
from dataclasses import dataclass
from functools import wraps

from django.http import JsonResponse
from django.utils import timezone

from control.users.models import SystemUser, RecentActivity


SESSION_USER_KEY = 'user_id'

# Verified against when a login attempt names an unknown user,
# so the response takes as long as a real bcrypt check and the
# timing can't be used to enumerate accounts
DUMMY_BCRYPT_HASH = '$2b$12$37rvWwtdP/sb.pZwBklPFeUxoH.KWOXIDjTxiiC9awCYpXIB8EbmS'








############################################################
# format_datetime
############################################################
#
# The API boundary's timestamp format: aware DateTimeFields
# come out of the database in UTC and leave the API as local
# "YYYY-MM-DD HH:MM:SS" strings — the shape the frontend has
# always rendered. None stays None (e.g. "never seen").
#
# Used by:
#   - every view that serializes a DateTimeField
############################################################

def format_datetime(value):
    if value is None:
        return None
    return timezone.localtime(value).strftime('%Y-%m-%d %H:%M:%S')








############################################################
# get_json
############################################################
#
# Parse the request body as JSON; None when there is no valid
# JSON. Views then index the result directly — a malformed
# body from a non-frontend caller fails loudly rather than
# being validated field by field.
#
# Used by:
#   - every POST/PUT view
############################################################

def get_json(request):
    try:
        return json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None








############################################################
# SessionUser
############################################################
#
# The request's user, re-read from the database on every
# request. admin/enabled are carried as integers (0/1) even
# though the model stores booleans — that is what the JSON
# contract exposes, and the conversion happens once, here.
#
# Used by:
#   - login_required / admin_required — set request.current_user
############################################################

@dataclass
class SessionUser:
    id: int
    email: str
    password: str
    admin: int
    enabled: int








############################################################
# load_user / get_user_by_email
############################################################
#
# load_user resolves a session's user ID to a SessionUser —
# only Enabled accounts qualify (see the file header).
#
# get_user_by_email is the login lookup: it returns the user
# regardless of Enabled, because login still needs the stored
# hash for the constant-time password check; the login view
# rejects disabled accounts after that check.
#
# Used by:
#   - get_current_user (below), auth_views.login_view
############################################################

def load_user(user_id):
    thisUser = SystemUser.objects.filter(id=user_id, enabled=True).first()
    if thisUser is None:
        return None
    return SessionUser(thisUser.id, thisUser.email, thisUser.password, int(thisUser.admin), int(thisUser.enabled))



def get_user_by_email(email):
    thisUser = SystemUser.objects.filter(email=email).first()
    if thisUser is None:
        return None
    return SessionUser(thisUser.id, thisUser.email, thisUser.password, int(thisUser.admin), int(thisUser.enabled))








############################################################
# login / get_current_user
############################################################
#
# login() rotates the session key (fixation defense) and
# stores the user's ID — nothing else lives in the session.
# Logout lives in auth_views.logout_view (a session flush);
# the cookie itself is HttpOnly and JavaScript never touches
# it.
#
# Used by:
#   - auth_views.login_view, the decorators below
############################################################

def login(request, user):
    request.session.cycle_key()
    request.session[SESSION_USER_KEY] = user.id



def get_current_user(request):
    user_id = request.session.get(SESSION_USER_KEY)
    if user_id is None:
        return None
    return load_user(user_id)








############################################################
# login_required / admin_required
############################################################
#
# login_required resolves the session to request.current_user
# or answers 401. admin_required does the same and then
# requires Admin=1 — it implies login_required, so the
# dashboard views carry it alone.
#
# Caddy forward_auth only looks at the status code, so these
# 401s are also what denies access to /dbgate/* and the :8443
# VM tools at the proxy.
#
# Used by:
#   - every authenticated view
############################################################

def login_required(func):
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        thisUser = get_current_user(request)
        if thisUser is None:
            return JsonResponse({'message': 'Unauthorized'}, status=401)
        request.current_user = thisUser
        return func(request, *args, **kwargs)
    return wrapper



def admin_required(func):
    @wraps(func)
    def wrapper(request, *args, **kwargs):
        thisUser = get_current_user(request)
        if thisUser is None:
            return JsonResponse({'message': 'Unauthorized: Admin required'}, status=401)
        if not thisUser.admin:
            return JsonResponse({'message': 'Unauthorized: Admin required'}, status=401)
        request.current_user = thisUser
        return func(request, *args, **kwargs)
    return wrapper








############################################################
# check_user_is_allowed_to_access_vm
############################################################
#
# Admins may access every EXISTING, non-deleted VM; everyone
# else only their own. The existence check matters for the
# :8443 forward_auth gate — without it, an admin's tool tab
# for a dead id would be proxied into a dead upstream (502)
# instead of denied. Missing or deleted VMs answer False
# (→ 401), never an error.
#
# Used by:
#   - auth_views.checkauth (the :8443 forward_auth gate)
#   - vm_views / dns_views — every per-VM endpoint
############################################################

def check_user_is_allowed_to_access_vm(user, virtualServerID):
    from control.hosting.models import VirtualServer

    if virtualServerID is None:
        return False

    if user.admin == 1:
        return VirtualServer.objects.filter(id=virtualServerID, deleted=False).exists()

    ownerID = VirtualServer.objects.filter(id=virtualServerID, deleted=False).values_list('owner_id', flat=True).first()
    if ownerID is not None and ownerID == user.id:
        return True

    return False








############################################################
# log_activity
############################################################
#
# One RecentActivity row; created_at stamps itself. The
# message sentences are rendered verbatim by the frontend's
# activity widgets — treat the wording as part of the UI.
#
# Used by:
#   - login/register, account, vm and dns views
############################################################

def log_activity(user_id, message):
    RecentActivity.objects.create(user_id=user_id, message=message)
