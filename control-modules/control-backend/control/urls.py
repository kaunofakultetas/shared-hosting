############################################################
#  [*] URLs — the whole API surface in one file
#
#  One path() per endpoint, grouped by app — the Vite
#  frontend, the Caddy forward_auth gates and the external
#  SSH router are this surface's three consumers. Paths
#  spell out api/ themselves (Caddy does not strip prefixes)
#  and carry no trailing slashes (APPEND_SLASH = False).
#
#  Imports live next to the path group they serve, so the
#  file reads as a table of contents.
############################################################

from django.urls import path

urlpatterns = []








############################################################
# Users — login, registration, sessions, accounts
############################################################
#
# The session login, the Caddy forward_auth targets, the
# admin users grid and everything under /api/account.
# /api/login, /api/register and /api/logout are the
# unauthenticated paths in this group.
#
# Views live in control/users/api/.
############################################################

from control.users.api.auth_views import login_view, logout_view, register_view, checkauth, checkauth_admin
from control.users.api.account_views import change_password, registration_code, account_recentactivity
from control.users.api.users_views import admin_users

urlpatterns += [
    path('api/login', login_view),                                          # POST — JSON; failures carry a machine code the login page maps
    path('api/logout', logout_view),                                        # POST — flush the session (login page calls it on mount)
    path('api/register', register_view),                                    # POST — self-registration with an admin's code

    path('api/checkauth', checkauth),                                       # GET  — who is logged in (SPA calls it on every load)
    path('api/checkauth/vm/<int:virtualServerID>', checkauth),              # GET  — + VM ownership; Caddy forward_auth for :8443 tools
    path('api/checkauth/admin', checkauth_admin),                           # GET  — admin gate; Caddy forward_auth for /dbgate/*

    path('api/account/change-password', change_password),                   # POST — verify current, set new
    path('api/account/registration-code', registration_code),              # GET/POST/DELETE — this admin's one active code
    path('api/account/recentactivity', account_recentactivity),             # GET  — own activity, newest first, max 500

    path('api/admin/users', admin_users),                                   # GET list / POST insertupdate + delete
]








############################################################
# Hosting — virtual servers, domains, SSH router
############################################################
#
# The VM list/detail, the control actions proxied to the
# docker sidecar, the domain CRUD that regenerates the users
# Caddyfile, and the shared-secret endpoint the external SSH
# router calls to route server<N> logins.
#
# Views live in control/hosting/api/.
############################################################

from control.hosting.api.vm_views import vm_list, vm_control
from control.hosting.api.dns_views import dns_isvalid, vm_dns
from control.hosting.api.sshrouter_views import sshrouter

urlpatterns += [
    path('api/vm', vm_list),                                                # GET  — all visible VMs (?showOtherUsers= for admins)
    path('api/vm/control', vm_control),                                     # POST — create/start/stop/delete/rename
    path('api/vm/<int:virtualServerID>', vm_list),                          # GET  — one VM (still returns an array)

    path('api/vm/dns/isvalid', dns_isvalid),                                # GET  — live domain-name validation
    path('api/vm/dns/<int:virtualServerID>', vm_dns),                       # GET list / POST add / PUT edit
    path('api/vm/dns/<int:virtualServerID>/<int:domainID>', vm_dns),        # DELETE — one domain

    path('api/sshrouter', sshrouter),                                       # POST — shared-secret; upstream data for server<N> logins
]








############################################################
# Dashboard — admin home widgets
############################################################
#
# The three admin-only endpoints the dashboard polls every
# 2 seconds: host metrics from cAdvisor (+ Docker Hub pull
# limits through the exit proxy), the global activity feed
# and the platform totals.
#
# Views live in control/dashboard/api/.
############################################################

from control.dashboard.api.dashboard_views import dashboard_system, dashboard_recentactivity, dashboard_hostingsystem

urlpatterns += [
    path('api/dashboard/system', dashboard_system),                         # GET — CPU/RAM/disk + Docker Hub pull limits
    path('api/dashboard/recentactivity', dashboard_recentactivity),         # GET — newest 5 activity rows, all users
    path('api/dashboard/hostingsystem', dashboard_hostingsystem),           # GET — user/VM/domain totals
]
