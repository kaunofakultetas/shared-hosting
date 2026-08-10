############################################################
#  [*] users app — accounts, registration codes, activity
#
#  Everything about people: the account table the whole
#  platform authenticates against (bcrypt, rounds=12), the
#  admins'
#  30-minute self-registration codes (a OneToOne per admin),
#  and the append-only activity log every mutating endpoint
#  writes to.
#
#  Layout:
#    models.py             — SystemUser, RegistrationCode,
#                            RecentActivity
#    api/auth_views.py     — login, register, checkauth (the
#                            Caddy forward_auth gates)
#    api/account_views.py  — change-password, registration
#                            code CRUD, own activity feed
#    api/users_views.py    — the admin users grid
#    management/commands/  — bootstrap_db, transfer_legacy
#    migrations/           — schema history
#    apps.py               — the AppConfig INSTALLED_APPS
#                            points at
#
#  The session machinery itself (SessionUser, the decorators,
#  login()) lives in control/common/auth.py, not here — this
#  app owns the data, common owns the mechanism.
############################################################
