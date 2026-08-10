############################################################
#  [*] Account views — password, registration code, activity
#
#  Everything under /api/account: the signed-in user's
#  password change, the admin's self-registration code and
#  the personal activity feed.
#
#  Used by:
#    - Account.jsx — password card + activity list
#    - QuickRegistrationWidget — the code lifecycle
############################################################

import logging
import random
import string
from datetime import timedelta

import bcrypt
from django.http import JsonResponse
from django.utils import timezone

from control.common.auth import admin_required, format_datetime, get_json, log_activity, login_required
from control.users.models import RecentActivity, RegistrationCode, SystemUser


logger = logging.getLogger(__name__)








############################################################
# change_password
############################################################
#
# POST /api/account/change-password — verifies the current
# password before writing the new bcrypt hash (rounds=12).
#
# Used by:
#   - Account.jsx — the Change Password card
############################################################

@login_required
def change_password(request):
    if request.method != 'POST':
        return JsonResponse({'message': 'Method not allowed'}, status=405)

    postData = get_json(request)


    # Validation — both passwords are stripped like the login
    # view strips them: an unstripped hash could never be
    # matched at login again (a permanent lockout)
    if not postData or not postData.get('currentPassword'):
        return JsonResponse({'message': 'Current password is required'}, status=400)

    if not postData.get('newPassword'):
        return JsonResponse({'message': 'New password is required'}, status=400)

    currentPassword = postData['currentPassword'].strip()
    newPassword = postData['newPassword'].strip()

    if len(newPassword) < 8:
        return JsonResponse({'message': 'New password must be at least 8 characters'}, status=400)


    # Verify current password
    thisUser = SystemUser.objects.filter(id=request.current_user.id).first()
    if thisUser is None:
        return JsonResponse({'message': 'User not found'}, status=404)

    if not bcrypt.checkpw(currentPassword.encode(), thisUser.password.encode()):
        return JsonResponse({'message': 'Current password is incorrect'}, status=401)


    # Hash new password and update
    newPasswordHash = bcrypt.hashpw(newPassword.encode(), bcrypt.gensalt(rounds=12)).decode()
    SystemUser.objects.filter(id=request.current_user.id).update(password=newPasswordHash)

    # Log activity
    log_activity(request.current_user.id, f'User {request.current_user.email} changed their password')


    # Return Success
    return JsonResponse({'message': 'Password changed successfully'}, status=200)








############################################################
# registration_code
############################################################
#
# GET/POST/DELETE /api/account/registration-code — one live
# code per admin (UserID is unique). GET also sweeps expired
# codes globally — the widget polls GET, so the table stays
# clean without a cron.
# POST replaces this admin's code with a fresh 8-char one
# valid for 30 minutes.
#
# Used by:
#   - QuickRegistrationWidget — poll / generate / revoke
############################################################

@admin_required
def registration_code(request):

    # --- GET ---
    if request.method == 'GET':

        # Delete expired registration codes
        RegistrationCode.objects.filter(valid_until__lt=timezone.now()).delete()

        # Fetch registration code — validUntil leaves the API
        # as unix epoch seconds, like it always has
        codeRow = RegistrationCode.objects.filter(user_id=request.current_user.id).first()
        if codeRow is None:
            return JsonResponse({'message': 'No registration code found'}, status=404)
        return JsonResponse({'message': 'Registration code found', 'code': codeRow.code, 'validUntil': int(codeRow.valid_until.timestamp())}, status=200)


    # --- CREATE ---
    elif request.method == 'POST':
        validUntil = timezone.now() + timedelta(minutes=30)
        registrationCode = ''.join(random.choices(string.ascii_letters + string.digits, k=8)).upper()

        RegistrationCode.objects.update_or_create(
            user_id=request.current_user.id,
            defaults={'code': registrationCode, 'valid_until': validUntil},
        )

        return JsonResponse({'message': 'Registration code created successfully', 'code': registrationCode, 'validUntil': int(validUntil.timestamp())}, status=200)


    # --- DELETE ---
    elif request.method == 'DELETE':
        RegistrationCode.objects.filter(user_id=request.current_user.id).delete()

        return JsonResponse({'message': 'Registration code deleted successfully'}, status=200)


    return JsonResponse({'message': 'Method not allowed'}, status=405)








############################################################
# account_recentactivity
############################################################
#
# GET /api/account/recentactivity — the signed-in user's own
# activity, newest first, capped at 500. The email column is
# always the caller's own (the rows are filtered to their
# UserID), so no join is needed.
#
# Used by:
#   - Account.jsx — the Recent Activity list
############################################################

@login_required
def account_recentactivity(request):
    try:
        recent_activity = [
            {
                'log_id': thisRow.id,
                'email': request.current_user.email,
                'message': thisRow.message,
                'time': format_datetime(thisRow.created_at),
            }
            for thisRow in RecentActivity.objects.filter(user_id=request.current_user.id).order_by('-id')[:500]
        ]
        return JsonResponse(recent_activity, safe=False, status=200)
    except Exception as e:
        logger.exception('Failed to get recent activity')
        return JsonResponse({'message': 'Failed to get recent activity'}, status=500)
