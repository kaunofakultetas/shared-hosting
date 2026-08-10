############################################################
#  [*] bootstrap_db — idempotent first-boot database setup
#
#  For the FRESH SQLite file this backend owns (the legacy
#  database is untouched; a separate transfer command imports
#  its data later). The Dockerfile CMD runs this on EVERY
#  container start before the monitor and the web server —
#  idempotent by design, and still runnable by hand:
#
#    1. migrate — creates/updates the whole schema
#    2. seed the reserved HOST row (VirtualServer ID 0) the
#       monitor hangs host containers off — AUTOINCREMENT
#       never assigns 0, so the ID stays reserved
#    3. seed the default admin (admin@admin.com / admin) —
#       ONLY when there are no users at all, so it never
#       resurrects after the transfer or after deletion
############################################################

from django.core.management import call_command
from django.core.management.base import BaseCommand

from control.hosting.models import VirtualServer
from control.users.models import SystemUser


# Default Email:       admin@admin.com
# Default Password:    admin
DEFAULT_ADMIN_EMAIL = 'admin@admin.com'
DEFAULT_ADMIN_HASH = '$2a$12$4a3b6u7a1oBdtvuTkvw9TevgCwH36raEE2oe1BI9Wtt7.L4Pfb4YW'








############################################################
# Command
############################################################

class Command(BaseCommand):
    help = 'First-boot setup: migrate the fresh database and seed the defaults'

    def handle(self, *args, **options):

        # --- STEP 1: Migrations ---
        self.stdout.write('Running migrations')
        call_command('migrate', interactive=False)


        # --- STEP 2: The reserved HOST row (VM ID 0) ---
        hostRow, created = VirtualServer.objects.get_or_create(
            id=0,
            defaults={'owner': None, 'name': 'HOST', 'enabled': True, 'deleted': False},
        )
        if created:
            self.stdout.write('Seeded the HOST row (VirtualServer ID 0)')


        # --- STEP 3: The default admin, only on an empty users table ---
        if not SystemUser.objects.exists():
            SystemUser.objects.create(email=DEFAULT_ADMIN_EMAIL, password=DEFAULT_ADMIN_HASH, admin=True, enabled=True)
            self.stdout.write(f'Seeded the default admin ({DEFAULT_ADMIN_EMAIL} / admin) — change the password immediately')


        self.stdout.write(self.style.SUCCESS('Database ready'))
