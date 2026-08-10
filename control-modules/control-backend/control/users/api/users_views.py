############################################################
#  [*] Users admin view — the /admin/users grid backend
#
#  GET list + POST insertupdate/delete, admins only. The
#  mutation responses keep the grid contract: HTTP 200 with
#  {"type": "ok"} or {"type": "error", "reason": <sentence>}.
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
            return JsonResponse({'type': 'error', 'reason': 'Invalid request'})


        # --- INSERT/UPDATE ---
        if postData.get('action') == 'insertupdate':
            email = postData['email'].lower().strip()

            # Create
            if postData['id'] == '':
                if len(postData['password']) == 0:
                    return JsonResponse({'type': 'error', 'reason': 'Password must be at least 8 characters long'})

                passwordHash = bcrypt.hashpw(postData['password'].strip().encode(), bcrypt.gensalt(rounds=12)).decode()
                try:
                    with transaction.atomic():
                        SystemUser.objects.create(
                            email=email,
                            password=passwordHash,
                            admin=bool(postData['admin']),
                            enabled=bool(postData['enabled']),
                        )
                except IntegrityError:
                    return JsonResponse({'type': 'error', 'reason': 'User with this email already exists'})

            # Update
            else:
                thisUser = SystemUser.objects.filter(id=postData['id']).first()
                if thisUser is None:
                    return JsonResponse({'type': 'error', 'reason': 'User not found'})

                thisUser.email = email
                thisUser.admin = bool(postData['admin'])
                thisUser.enabled = bool(postData['enabled'])
                if len(postData['password']) != 0:
                    thisUser.password = bcrypt.hashpw(postData['password'].strip().encode(), bcrypt.gensalt(rounds=12)).decode()

                try:
                    with transaction.atomic():
                        thisUser.save()
                except IntegrityError:
                    return JsonResponse({'type': 'error', 'reason': 'User with this email already exists'})

            return JsonResponse({'type': 'ok'})


        # --- DELETE ---
        elif postData.get('action') == 'delete':

            # Prevent user from deleting himself
            if int(postData['id']) == request.current_user.id:
                return JsonResponse({'type': 'error', 'reason': 'Cannot delete yourself'})

            # Check if user has any virtual servers
            if VirtualServer.objects.filter(owner_id=postData['id'], deleted=False).exists():
                return JsonResponse({'type': 'error', 'reason': 'User has virtual servers'})

            # Delete user
            SystemUser.objects.filter(id=postData['id']).delete()
            return JsonResponse({'type': 'ok'})


        # --- ILLEGAL ACTION ---
        return JsonResponse({'type': 'error', 'reason': 'Illegal action'})


    return JsonResponse({'message': 'Method not allowed'}, status=405)
