#!/bin/bash
# route_user.sh: ForceCommand for dynamic routing

# The “universal” password is checked by sshd_config using the single shadow-like file we made.

case "$LOGNAME" in
  student5)
    exec ssh -o StrictHostKeyChecking=no admin@hosting-users-dind-5
    ;;
  student9)
    exec ssh -o StrictHostKeyChecking=no admin@hosting-users-dind-9
    ;;
  *)
    echo "No route for user '$LOGNAME'. Try student5 or student9."
    exit 1
    ;;
esac
