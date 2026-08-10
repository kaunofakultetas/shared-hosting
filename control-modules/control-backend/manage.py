#!/usr/bin/env python3
############################################################
#  [*] manage.py — Django CLI entry point
#
#  Standard Django manage.py pointed at control.settings.
#  The commands this project actually uses:
#    manage.py bootstrap_db         — first-boot DB setup
#    manage.py monitor_containers   — the 3 s docker monitor
#    manage.py migrate / shell      — the usual Django ones
############################################################

import os
import sys


def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'control.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
