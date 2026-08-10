############################################################
#  [*] Users admin view — the /admin/users grid backend
#
#  GET list + POST insertupdate/delete, admins only.
#  Mutations answer real status codes (400 validation, 404
#  missing user, 409 conflicts) with a {"type": "error",
#  "reason": <sentence>} body the dialog renders; success is
#  200 {"type": "ok"}.
#
#  Real failures surface as type=error reasons the dialog
#  renders:
#    - creating/renaming onto a taken email answers
#      "User with this email already exists"
#    - updating a missing user answers "User not found"
#
#  Used by:
#    - UsersListTable.jsx — the grid
#    - AddEditUser.jsx — the dialog
############################################################

from django.db import IntegrityError, transaction
from django.db.models import Count
from django.http import JsonResponse

import bcrypt

from control.common.auth import admin_required, format_datetime, get_json
from control.hosting.models import VirtualServer
from control.users.models import SystemUser








############################################################
# admin_users
############################################################

@admin_required
def admin_users(request):

    # --- GET — the full users list for the grid ---
    if request.method == 'GET':

        # Non-deleted server counts per owner, in one query
        serverCounts = dict(
            VirtualServer.objects.filter(deleted=False)
            .values_list('owner_id')
            .annotate(count=Count('id'))
        )

        users = [
            {
                'id': thisUser.id,
                'email': thisUser.email,
                'servercount': serverCounts.get(thisUser.id, 0),
                'admin': int(thisUser.admin),
                'enabled': int(thisUser.enabled),
                'lastseen': format_datetime(thisUser.last_login),
            }
            for thisUser in SystemUser.objects.order_by('id')
        ]
        return JsonResponse(users, safe=False, json_dumps_params={'indent': 4})


    # --- POST — insertupdate / delete ---
    elif request.method == 'POST':
        postData = get_json(request)
        if postData is None:
            return JsonResponse({'type': 'error', 'reason': 'Invalid request'}, status=400)


        # --- INSERT/UPDATE ---
        if postData.get('action') == 'insertupdate':
            email = postData['email'].lower().strip()
            password = postData['password'].strip()

            # A non-empty password must meet the policy, both on
            # create and on an edit that changes it
            if len(password) != 0 and len(password) < 8:
                return JsonResponse({'type': 'error', 'reason': 'Password must be at least 8 characters long'}, status=400)

            # Create
            if postData['id'] == '':
                if len(password) == 0:
                    return JsonResponse({'type': 'error', 'reason': 'Password must be at least 8 characters long'}, status=400)

                passwordHash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()
                try:
                    with transaction.atomic():
                        SystemUser.objects.create(
                            email=email,
                            password=passwordHash,
                            admin=bool(postData['admin']),
                            enabled=bool(postData['enabled']),
                        )
                except IntegrityError:
                    return JsonResponse({'type': 'error', 'reason': 'User with this email already exists'}, status=409)

            # Update
            else:
                thisUser = SystemUser.objects.filter(id=postData['id']).first()
                if thisUser is None:
                    return JsonResponse({'type': 'error', 'reason': 'User not found'}, status=404)

                thisUser.email = email
                thisUser.admin = bool(postData['admin'])
                thisUser.enabled = bool(postData['enabled'])
                if len(password) != 0:
                    thisUser.password = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12)).decode()

                try:
                    with transaction.atomic():
                        thisUser.save()
                except IntegrityError:
                    return JsonResponse({'type': 'error', 'reason': 'User with this email already exists'}, status=409)

            return JsonResponse({'type': 'ok'})


        # --- DELETE ---
        elif postData.get('action') == 'delete':

            # Prevent user from deleting himself
            if int(postData['id']) == request.current_user.id:
                return JsonResponse({'type': 'error', 'reason': 'Cannot delete yourself'}, status=400)

            # Check if user has any virtual servers
            if VirtualServer.objects.filter(owner_id=postData['id'], deleted=False).exists():
                return JsonResponse({'type': 'error', 'reason': 'User has virtual servers'}, status=409)

            # Delete user
            SystemUser.objects.filter(id=postData['id']).delete()
            return JsonResponse({'type': 'ok'})


        # --- ILLEGAL ACTION ---
        return JsonResponse({'type': 'error', 'reason': 'Illegal action'}, status=400)


    return JsonResponse({'message': 'Method not allowed'}, status=405)
