############################################################
#  [*] Users models — accounts, codes, activity
#
#  Fresh, properly-constrained schema (this backend starts
#  on its own new SQLite file; a transfer script imports the
#  old data later). Real types and real relations:
#
#    - flags are BooleanFields; timestamps are DateTimeFields
#      (stored UTC, rendered as local "YYYY-MM-DD HH:MM:SS"
#      strings at the API boundary — the JSON contract still
#      exposes 0/1 integers and strings)
#    - cross-references are ForeignKeys with explicit
#      on_delete behavior, enforced by the database
############################################################

from django.db import models








############################################################
# SystemUser
############################################################
#
# One account. Password is a bcrypt hash (rounds=12) — the
# transfer script carries the old hashes over unchanged, so
# passwords keep working. last_login is really "last seen":
# every checkauth bumps it; NULL means never seen.
#
# Deleting a user cascades their registration code, detaches
# their activity rows (kept, shown as "Deleted User") and
# detaches their soft-deleted VMs (owner becomes NULL) — the
# users grid refuses deletion while non-deleted VMs exist.
#
# Used by:
#   - common/auth.py — session resolution and login
#   - users_views — the admin users grid
############################################################

class SystemUser(models.Model):

    # Columns
    email = models.CharField(max_length=255, unique=True)
    password = models.CharField(max_length=255)
    admin = models.BooleanField(default=False)
    enabled = models.BooleanField(default=False)
    last_login = models.DateTimeField(null=True, blank=True)

    # String representation
    def __str__(self):
        return self.email








############################################################
# RegistrationCode
############################################################
#
# One live self-registration code per admin — a OneToOne, so
# the "one code per admin" rule is a database constraint, not
# a convention. Dies with its admin (CASCADE). The API still
# exposes validUntil as unix epoch seconds.
#
# Used by:
#   - account_views.registration_code — create/show/delete
#   - auth_views.register_view — code validation
############################################################

class RegistrationCode(models.Model):

    # Columns
    user = models.OneToOneField(SystemUser, on_delete=models.CASCADE, related_name='registration_code')
    code = models.CharField(max_length=32, unique=True)
    valid_until = models.DateTimeField()

    # String representation
    def __str__(self):
        return self.code








############################################################
# RecentActivity
############################################################
#
# The append-only activity log. Message is a free-form
# English sentence rendered verbatim by the frontend widgets.
# The author is SET_NULL on user deletion — the log outlives
# its users and renders them as "Deleted User".
#
# Used by:
#   - common/auth.log_activity — every writer
#   - account_views / dashboard_views — the readers
############################################################

class RecentActivity(models.Model):

    # Columns
    user = models.ForeignKey(SystemUser, null=True, blank=True, on_delete=models.SET_NULL, related_name='activity')
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    # String representation
    def __str__(self):
        return f'#{self.id} {self.message}'
