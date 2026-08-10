############################################################
#  [*] users commands — bootstrap_db, transfer_legacy
#
#  Every module in this package becomes a manage.py
#  subcommand:
#
#    bootstrap_db     — idempotent migrate + the HOST-row
#                       and default-admin seeds; the
#                       container CMD runs it on every start,
#                       so a plain `docker compose up`
#                       reaches a working state
#    transfer_legacy  — the one-time import of the legacy
#                       database.db with IDs and hashes
#                       preserved (--dry-run/--force); run
#                       manually, once
############################################################
