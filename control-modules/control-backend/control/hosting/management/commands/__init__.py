############################################################
#  [*] hosting commands — monitor_containers
#
#  Every module in this package becomes a manage.py
#  subcommand:
#
#    monitor_containers — the 3-second docker ps cache loop
#                         feeding the VM list; the container
#                         CMD starts exactly one instance
#                         beside the web server (before
#                         gunicorn forks) and respawns it if
#                         it ever exits
############################################################
