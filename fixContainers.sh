#!/bin/bash

######################################################################################
# Fix found on:
#   https://gist.github.com/ffabreti/c9ad7b882118fa0106ccbfbf3942bcfd
# Issue: https://github.com/nestybox/sysbox/issues/812
#
# This script fixes permission issues in sysbox containers after unclean shutdowns
# Automatically processes all containers with names starting with "hosting-users-dind-"
######################################################################################



# Check if running as root, if not re-run with sudo
if [ "$EUID" -ne 0 ]; then 
    echo "This script requires root privileges. Requesting sudo access..."
    sudo "$0" "$@"
    exit $?
fi



#set -x
TIMESTAMP=$(date +'%Y%m%d-%H%M%S')
WD=$(pwd)
OUT="/tmp/perms-$TIMESTAMP" && mkdir -p "$OUT" 2> /dev/null

# Directories where the problem occurs
# Note: var/lib/docker and var/lib/sysbox are excluded (special sysbox directories)
DIRS='etc '
#DIRS+='usr '
#DIRS+='var/backups  var/cache  var/local  var/log  var/mail  var/opt  var/lib/apt  var/lib/buildkit '
#DIRS+='var/lib/containerd  var/lib/dbus  var/lib/dpkg  var/lib/git  var/lib/k0s  var/lib/kubelet '
#DIRS+='var/lib/logrotate var/lib/misc  var/lib/pam  var/lib/polkit-1  var/lib/private  var/lib/rancher '
#DIRS+='var/lib/shells.state var/lib/sudo var/lib/systemd  var/lib/ucf  var/lib/vim '

# Default UID/GID mapping for sysbox containers
CONTAINER_ROOT_ID=165536
CONTAINER_ROOT_GROUP_ID=165536

echo "======================================================================="
echo "Running script [$0]"
echo "Timestamp: $TIMESTAMP"
echo "Output directory: $OUT"
echo "CONTAINER_ROOT_ID=$CONTAINER_ROOT_ID"
echo "CONTAINER_ROOT_GROUP_ID=$CONTAINER_ROOT_GROUP_ID"
echo "======================================================================="
echo ""

# Find all containers with names starting with "hosting-users-dind-"
CONTAINER_PATTERN="^hosting-users-dind-"
echo "Searching for containers matching pattern: $CONTAINER_PATTERN"

# Get list of container names (both running and stopped)
CONTAINERS=$(docker ps -a --format '{{.Names}}' | grep -E "$CONTAINER_PATTERN")

if [ -z "$CONTAINERS" ]; then
    echo "ERROR: No containers found matching pattern '$CONTAINER_PATTERN'"
    exit 1
fi

CONTAINER_COUNT=$(echo "$CONTAINERS" | wc -l)
echo "Found $CONTAINER_COUNT container(s) to process:"
echo "$CONTAINERS"
echo ""

tty -s && echo "Press <ENTER> to continue or <CTRL>+C to cancel" && read -r

# Counter for processed containers
PROCESSED=0
FAILED=0

# Process each container
while IFS= read -r CONTAINER_NAME; do
    echo "======================================================================="
    echo "Processing container: $CONTAINER_NAME"
    echo "======================================================================="
    
    # Get the MergedDir for this container
    MERGED=$(docker inspect "$CONTAINER_NAME" 2>/dev/null | grep -oP '"MergedDir":\s*"\K[^"]+' | head -1)
    
    if [ -z "$MERGED" ]; then
        echo "WARNING: Could not find MergedDir for container '$CONTAINER_NAME'"
        echo "         Skipping this container."
        ((FAILED++))
        echo ""
        continue
    fi
    
    if [ ! -d "$MERGED" ]; then
        echo "WARNING: MergedDir does not exist: $MERGED"
        echo "         Skipping this container."
        ((FAILED++))
        echo ""
        continue
    fi
    
    echo "MergedDir: $MERGED"
    
    # Create subdirectory for this container's output
    CONTAINER_OUT="$OUT/$CONTAINER_NAME"
    mkdir -p "$CONTAINER_OUT" 2> /dev/null
    
    # Process each directory
    for D in $DIRS; do
        echo "  Processing directory: $D"
        cd /
        THISNAME=${D//\//\-}  #ex: var/log/nginx => var-log-nginx
        
        # Save the names of the files that are exceptions to ignore
        find "$D" \! -user  root 2>/dev/null > "$CONTAINER_OUT/$THISNAME.orig.notroot.user"
        find "$D" \! -group root 2>/dev/null > "$CONTAINER_OUT/$THISNAME.orig.notroot.group"
        
        # Generate list of files to modify
        cd "$MERGED"
        
        # Save the names of the files that are not root,
        # excluding the files that originally are not root
        # that is, only the files that are with wrong permission
        find "$D" \! -user  $CONTAINER_ROOT_ID 2>/dev/null | grep -v -x -F -f "$CONTAINER_OUT/$THISNAME.orig.notroot.user"  > "$CONTAINER_OUT/$THISNAME.target.notroot.user"
        find "$D" \! -group $CONTAINER_ROOT_GROUP_ID 2>/dev/null | grep -v -x -F -f "$CONTAINER_OUT/$THISNAME.orig.notroot.group" > "$CONTAINER_OUT/$THISNAME.target.notroot.group"
        
        # If the file is not empty
        # 1. save listing with old permissions
        # 2. change user or group permissions
        # 3. save listing with new permissions
        if [ -s "$CONTAINER_OUT/$THISNAME.target.notroot.user" ]; then
            USER_COUNT=$(wc -l < "$CONTAINER_OUT/$THISNAME.target.notroot.user")
            echo "    Changing user permissions for $USER_COUNT file(s)"
            ls -la $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.user") > "$CONTAINER_OUT/$THISNAME.target.notroot.user.ls-before" 2>/dev/null
            chown --no-dereference $CONTAINER_ROOT_ID $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.user") 2>/dev/null
            ls -la $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.user") > "$CONTAINER_OUT/$THISNAME.target.notroot.user.ls-after" 2>/dev/null
        fi
        
        if [ -s "$CONTAINER_OUT/$THISNAME.target.notroot.group" ]; then
            GROUP_COUNT=$(wc -l < "$CONTAINER_OUT/$THISNAME.target.notroot.group")
            echo "    Changing group permissions for $GROUP_COUNT file(s)"
            ls -la $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.group") > "$CONTAINER_OUT/$THISNAME.target.notroot.group.ls-before" 2>/dev/null
            chgrp --no-dereference $CONTAINER_ROOT_GROUP_ID $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.group") 2>/dev/null
            ls -la $(cat "$CONTAINER_OUT/$THISNAME.target.notroot.group") > "$CONTAINER_OUT/$THISNAME.target.notroot.group.ls-after" 2>/dev/null
        fi
    done
    
    ((PROCESSED++))
    echo "✓ Completed processing: $CONTAINER_NAME"
    echo ""

    # Restart the container immediately after fixing
    echo "  Restarting container $CONTAINER_NAME..."
    docker restart "$CONTAINER_NAME"
    echo "  ✓ Container restarted."
    echo ""
    
done <<< "$CONTAINERS"

cd "$WD"

echo "======================================================================="
echo "Summary:"
echo "  Total containers found: $CONTAINER_COUNT"
echo "  Successfully processed: $PROCESSED"
echo "  Failed/Skipped: $FAILED"
echo "  Output saved to: $OUT"
echo "======================================================================="

exit 0