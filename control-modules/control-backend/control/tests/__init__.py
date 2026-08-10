############################################################
#  [*] Contract tests — the API pinned as one suite
#
#  Project-level on purpose: these are CONTRACT tests that
#  exercise whole request paths (settings + common/auth +
#  app views together), not per-app unit tests — so they
#  live as one artifact instead of fragments inside the
#  product apps.
#
#  Layout:
#    helpers.py         — shared factories + client wrappers
#    test_users.py      — login/logout/checkauth/register/
#                         account/admin grid
#    test_hosting.py    — vm list/control, dns, sshrouter
#                         (docker sidecar fully mocked)
#    test_dashboard.py  — admin widgets + no-leak guarantees
#
#  Run inside the container:
#    python3 manage.py test control
############################################################
