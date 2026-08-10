############################################################
#  [*] transfer_legacy — one-time import of the legacy data
#
#  Copies the legacy database.db (System_Users,
#  Hosting_VirtualServers, Hosting_DomainNames,
#  System_RecentActivity) into this backend's fresh schema:
#
#    - IDs are preserved EXACTLY — the VM ID names the
#      hosting-users-dind-<id> container, the server<id> SSH
#      login and the SERVERS/<id> directory, so it must not
#      shift. Explicit-ID inserts also advance SQLite's
#      AUTOINCREMENT counters on their own.
#    - bcrypt hashes are copied unchanged (passwords keep
#      working); Admin/Enabled 0/1 become booleans
#    - "YYYY-MM-DD HH:MM:SS" local-time strings become aware
#      datetimes ('' → NULL for last_login, import-time for
#      the NOT NULL created_at/updated_at columns)
#    - OwnerID 0 and owners that no longer exist become NULL
#    - registration codes (30-minute lifetime) and the
#      container cache (the monitor refills it in 3 s) are
#      not copied
#
#  The target's app tables are WIPED first — they only ever
#  hold the seeded admin and monitor-adopted VMs on a fresh
#  install. A target with any other data is refused unless
#  --force is given. Everything runs in ONE transaction, so
#  the concurrent monitor just blocks on the write lock and
#  re-syncs after commit.
#
#  Usage:
#    manage.py transfer_legacy [--source /data/database.db]
#                              [--dry-run] [--force]
############################################################

import sqlite3
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from control.hosting.models import DockerContainer, DomainName, VirtualServer
from control.users.models import RecentActivity, RegistrationCode, SystemUser


# Matches bootstrap_db's seed — its presence still counts as
# a "fresh" target
DEFAULT_ADMIN_EMAIL = 'admin@admin.com'

LEGACY_TABLES = ['System_Users', 'Hosting_VirtualServers', 'Hosting_DomainNames', 'System_RecentActivity']








############################################################
# parse_legacy_timestamp
############################################################
#
# Legacy timestamps are "YYYY-MM-DD HH:MM:SS" strings written
# in the container's local time (Europe/Vilnius via the
# /etc/localtime mount) — make_aware attaches that same zone,
# so the values round-trip through the API unchanged. Empty
# or unparseable values return None; the caller decides the
# fallback per column.
#
# Used by:
#   - Command.handle (below) — every timestamp column
############################################################

def parse_legacy_timestamp(value):
    if not value:
        return None
    try:
        return timezone.make_aware(datetime.strptime(value, '%Y-%m-%d %H:%M:%S'))
    except ValueError:
        return None








############################################################
# Command
############################################################
#
# Used by:
#   - run manually once before the Caddy cutover (README);
#     nothing calls this automatically
############################################################

class Command(BaseCommand):
    help = 'One-time import of the legacy database.db into the fresh schema'

    def add_arguments(self, parser):
        parser.add_argument('--source', default='/data/database.db', help='Path of the legacy SQLite file')
        parser.add_argument('--dry-run', action='store_true', help='Report what would be imported without writing')
        parser.add_argument('--force', action='store_true', help='Wipe a target that holds more than the fresh-install seeds')






    def handle(self, *args, **options):

        # STEP 1: Open the legacy database read-only and check
        #         it actually has the legacy tables
        # =====================================================
        try:
            legacyConn = sqlite3.connect(f'file:{options["source"]}?mode=ro', uri=True)
            legacyConn.row_factory = sqlite3.Row
        except sqlite3.OperationalError as e:
            raise CommandError(f'Cannot open {options["source"]}: {e}')

        legacyTableNames = {row[0] for row in legacyConn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        missingTables = [table for table in LEGACY_TABLES if table not in legacyTableNames]
        if missingTables:
            raise CommandError(f'{options["source"]} does not look like the legacy database — missing: {", ".join(missingTables)}')


        # STEP 2: Read everything into memory (a few thousand
        #         rows at most)
        # =====================================================
        legacyUsers = legacyConn.execute('SELECT ID, Email, Password, Admin, Enabled, LastLogin FROM System_Users ORDER BY ID').fetchall()
        legacyVms = legacyConn.execute('SELECT ID, OwnerID, Name, Enabled, Deleted, CreatedAt, UpdatedAt FROM Hosting_VirtualServers ORDER BY ID').fetchall()
        legacyDomains = legacyConn.execute('SELECT ID, VirtualServerID, DomainName, IsCloudflare, SSL FROM Hosting_DomainNames ORDER BY ID').fetchall()
        legacyActivity = legacyConn.execute('SELECT ID, UserID, Message, Time FROM System_RecentActivity ORDER BY ID').fetchall()
        legacyConn.close()

        legacyUserIds = {row['ID'] for row in legacyUsers}
        legacyVmIds = {row['ID'] for row in legacyVms}

        # Domains pointing at a VM row that no longer exists
        # cannot satisfy the new FK — count them out loud
        importableDomains = [row for row in legacyDomains if row['VirtualServerID'] in legacyVmIds]
        skippedDomains = [row['DomainName'] for row in legacyDomains if row['VirtualServerID'] not in legacyVmIds]


        # STEP 3: Refuse a non-fresh target without --force —
        #         monitor-adopted VMs and the seeded admin are
        #         expected on a fresh install, anything else is
        #         real data the wipe below would destroy
        # =====================================================
        extraUsers = SystemUser.objects.exclude(email=DEFAULT_ADMIN_EMAIL).count()
        targetIsFresh = (
            extraUsers == 0
            and DomainName.objects.count() == 0
            and RecentActivity.objects.count() == 0
        )
        if not targetIsFresh and not options['force']:
            raise CommandError('Target database already holds data beyond the fresh-install seeds — rerun with --force to wipe and reimport')


        # STEP 4: Dry run — report and stop before any write
        # =====================================================
        self.stdout.write(f'Legacy source: {options["source"]}')
        self.stdout.write(f'  users: {len(legacyUsers)}   vms: {len(legacyVms)} (incl. HOST row)   domains: {len(importableDomains)}   activity: {len(legacyActivity)}')
        if skippedDomains:
            self.stdout.write(f'  skipping domains with no VM row: {", ".join(skippedDomains)}')
        if options['dry_run']:
            self.stdout.write(self.style.SUCCESS('Dry run — nothing written'))
            return


        # STEP 5: Wipe + import in ONE transaction. The 3 s
        #         monitor blocks on the write lock meanwhile
        #         and re-syncs the container cache after commit.
        # =====================================================
        with transaction.atomic():

            # STEP 5.1: Wipe the target app tables (cache rows
            #           die with their VMs via CASCADE, codes
            #           with their users)
            RecentActivity.objects.all().delete()
            DomainName.objects.all().delete()
            VirtualServer.objects.all().delete()
            RegistrationCode.objects.all().delete()
            SystemUser.objects.all().delete()


            # STEP 5.2: Users — original IDs, hashes unchanged
            SystemUser.objects.bulk_create([
                SystemUser(
                    id=row['ID'],
                    email=row['Email'],
                    password=row['Password'],
                    admin=bool(row['Admin']),
                    enabled=bool(row['Enabled']),
                    last_login=parse_legacy_timestamp(row['LastLogin']),
                )
                for row in legacyUsers
            ], batch_size=500)


            # STEP 5.3: Virtual servers — original IDs; OwnerID
            #           0 or a vanished owner becomes NULL.
            #           auto_now(_add) stamps import time on
            #           create, so the real timestamps are
            #           written by update() right after.
            VirtualServer.objects.bulk_create([
                VirtualServer(
                    id=row['ID'],
                    owner_id=row['OwnerID'] if row['OwnerID'] in legacyUserIds and row['OwnerID'] != 0 else None,
                    name=row['Name'],
                    enabled=bool(row['Enabled']),
                    deleted=bool(row['Deleted']),
                )
                for row in legacyVms
            ], batch_size=500)

            importTime = timezone.now()
            for row in legacyVms:
                VirtualServer.objects.filter(id=row['ID']).update(
                    created_at=parse_legacy_timestamp(row['CreatedAt']) or importTime,
                    updated_at=parse_legacy_timestamp(row['UpdatedAt']) or importTime,
                )


            # STEP 5.4: Domains — original IDs and VM links
            DomainName.objects.bulk_create([
                DomainName(
                    id=row['ID'],
                    virtual_server_id=row['VirtualServerID'],
                    domain_name=row['DomainName'],
                    is_cloudflare=bool(row['IsCloudflare']),
                    ssl=bool(row['SSL']),
                )
                for row in importableDomains
            ], batch_size=500)


            # STEP 5.5: Activity — authors that no longer exist
            #           become NULL ("Deleted User" in the UI);
            #           created_at fixed up the same way as the
            #           VM timestamps
            RecentActivity.objects.bulk_create([
                RecentActivity(
                    id=row['ID'],
                    user_id=row['UserID'] if row['UserID'] in legacyUserIds else None,
                    message=row['Message'],
                )
                for row in legacyActivity
            ], batch_size=500)

            for row in legacyActivity:
                RecentActivity.objects.filter(id=row['ID']).update(
                    created_at=parse_legacy_timestamp(row['Time']) or importTime,
                )


        # STEP 6: Verify — imported counts must match the
        #         legacy counts read in STEP 2
        # =====================================================
        finalCounts = {
            'users': (SystemUser.objects.count(), len(legacyUsers)),
            'vms': (VirtualServer.objects.count(), len(legacyVms)),
            'domains': (DomainName.objects.count(), len(importableDomains)),
            'activity': (RecentActivity.objects.count(), len(legacyActivity)),
        }
        mismatches = {name: pair for name, pair in finalCounts.items() if pair[0] != pair[1]}
        if mismatches:
            raise CommandError(f'Count mismatch after import: {mismatches}')

        orphanedVms = VirtualServer.objects.filter(owner__isnull=True).exclude(id=0).count()
        self.stdout.write(f'Imported: {len(legacyUsers)} users, {len(legacyVms)} vms, {len(importableDomains)} domains, {len(legacyActivity)} activity rows')
        self.stdout.write(f'Ownerless VMs after import (OwnerID was 0 or owner gone): {orphanedVms}')
        self.stdout.write(self.style.SUCCESS('Transfer complete — the monitor re-syncs the container cache within 3 s'))
