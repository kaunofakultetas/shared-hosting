############################################################
#  [*] users migrations — schema history of the users app
#
#  0001_initial — SystemUser, RegistrationCode (OneToOne to
#  its admin, CASCADE) and RecentActivity (author SET_NULL,
#  the log outlives its users). Written by hand to match
#  models.py exactly — `manage.py makemigrations --check`
#  proves they stayed in sync.
#
#  This file must exist: Django's migration loader SKIPS
#  namespace packages, so without it every migration here
#  silently disappears from `migrate` — a fresh boot would
#  create no tables instead of failing loudly.
############################################################
