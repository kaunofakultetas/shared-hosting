############################################################
#  [*] Docker controller tests — the sidecar's contract
#
#  Plain unittest + Flask's test client — no extra
#  dependencies. Every external is mocked: the docker CLI
#  (Popen), the host socket (requests_unixsocket), the
#  dockersocket proxy (requests) and the filesystem — no
#  test touches a real container or directory.
#
#  Layout:
#    helpers.py               — app client + fake processes
#    test_status.py           — docker ps reshaping contract
#    test_virtual_servers.py  — lifecycle guards + outcomes
#    test_usage.py            — the du sweep
#    test_caddy.py            — Caddyfile rendering + reload
#
#  Run inside the container:
#    python3 -m unittest discover tests -v
############################################################
