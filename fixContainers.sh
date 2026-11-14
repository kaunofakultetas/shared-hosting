#!/bin/bash

############################################################
#  [*] fixContainers — heal student VMs whose image lost its
#      sysbox ID-mapping
#
#  Student VMs are sysbox containers. On this host (kernel
#  6.8, no shiftfs) sysbox ID-maps the image layers, so uid 0
#  on disk is root inside the VM, and sysbox-mgr chowns the
#  container's own overlayfs upper layer from 0 to 165536
#  when the VM starts and back when it stops.
#
#  sysbox-mgr keeps the "chowned, revert on stop" record only
#  in memory. When sysbox restarts under running VMs
#  (needrestart did it after a libc upgrade on 2026-11-14,
#  see host-config/needrestart/sysbox.conf) or the host dies,
#  the next stop skips the revert and the upper layer stays
#  owned by 165536. The next start finds a rootfs that
#  already belongs to the VM's root, takes it for pre-shifted
#  and skips the ID-mapping — and from then on, on every
#  restart, every image file shows up as nobody:nogroup
#  inside the VM: sshd can't read its host keys ("no hostkeys
#  available"), nothing can be installed into /usr, sudo is
#  setuid-nobody.
#
#  A stuck VM is healed by stopping it, shifting its upper
#  layer back exactly as sysbox-mgr would have (ids 165536 to
#  231071 become 0 to 65535, setuid/setgid bits and ACLs are
#  kept) and starting it again, after which sysbox ID-maps it
#  properly. A stuck VM that is already stopped is only
#  shifted back, so its next start is clean. Every changed
#  path is logged with its old and new owner in
#  _LOGS/fixContainers/<timestamp>/<container>.tsv.
#
#  Without arguments every hosting-users-dind-* container is
#  checked; VM numbers or container names narrow that down,
#  --dry-run only reports and --yes skips the confirmation.
#  --boot is the offline mode sysbox-rootfs-guard.service
#  runs right before docker starts: no container can be
#  running then, so every stuck sysbox container is fixed.
#
#  It is plain bash on coreutils, findutils and the docker
#  CLI, and it runs as the operator: everything that needs
#  root goes through sudo inside the script, and when it is
#  started as root (the systemd guard) those sudo calls just
#  pass through. The acl package is optional — with it ACL
#  entries are shifted along, without it paths that carry
#  ACLs are only reported.
#
#  It replaces the workaround from the sysbox issue #812
#  gist, which chowned the VM's /etc to root through the
#  merged dir: that copied /etc into the upper layer but left
#  the rest of the image owned by nobody, and it skipped VMs
#  that happened to be stopped while it ran.
############################################################


# sysbox CE gives every container the same id range: the "sysbox" line of /etc/subuid
SB_BASE=$(awk -F: '$1 == "sysbox" { print $2 }' /etc/subuid)
SB_BASE=${SB_BASE:-165536}
SB_SIZE=$(awk -F: '$1 == "sysbox" { print $3 }' /etc/subuid)
SB_SIZE=${SB_SIZE:-65536}

# sysbox's own revert subtracts SB_BASE from every id without a range check, so an id
# that was never shifted comes out wrapped just below 2^32 — that range is moved back too
SB_WRAP=$((2**32 - SB_BASE))

# find(1) test: the uid or the gid lies in the sysbox range or in the wrapped one
IN_RANGE=(  \( -uid +$((SB_BASE - 1)) -uid -$((SB_BASE + SB_SIZE)) \)
         -o \( -gid +$((SB_BASE - 1)) -gid -$((SB_BASE + SB_SIZE)) \)
         -o \( -uid +$((SB_WRAP - 1)) -uid -$((SB_WRAP + SB_SIZE)) \)
         -o \( -gid +$((SB_WRAP - 1)) -gid -$((SB_WRAP + SB_SIZE)) \) )

VM_PATTERN="^hosting-users-dind-"
DOCKER_ROOT=/var/lib/docker
SCRIPT_DIR=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
LOG_DIR="$SCRIPT_DIR/_LOGS/fixContainers/$(date +'%Y%m%d-%H%M%S')"








############################################################
# unshift
############################################################
#
# What one id becomes after the shift-back: ids from the
# sysbox range and from the wrapped range move down into 0
# to 65535, every other id stays as it is.
#
# Used by:
#   - shift_upper_back, upper_is_shifted (below)
############################################################

unshift() {
    local id=$1
    if [ "$id" -ge "$SB_BASE" ] && [ "$id" -lt $((SB_BASE + SB_SIZE)) ]; then
        echo $((id - SB_BASE))
    elif [ "$id" -ge "$SB_WRAP" ] && [ "$id" -lt $((SB_WRAP + SB_SIZE)) ]; then
        echo $((id - SB_WRAP))
    else
        echo "$id"
    fi
}








############################################################
# shift_acl_dump
############################################################
#
# Filters a getfacl dump (numeric ids) the way unshift moves
# owners: the ids of named user and group entries, default
# ones included, are moved back, and only lines that really
# change are rewritten, so ids awk would print in exponent
# form never pass through it. The owner and group comment
# lines are dropped, because setfacl --restore would chown
# the paths back to them.
#
# Used by:
#   - shift_acls (below)
############################################################

shift_acl_dump() {
    awk -F: -v OFS=: -v base="$SB_BASE" -v size="$SB_SIZE" -v wrap="$SB_WRAP" '
        function back(id) {
            if (id >= base && id < base + size) return id - base
            if (id >= wrap && id < wrap + size) return id - wrap
            return id
        }
        /^# (owner|group):/             { next }
        /^(user|group):[0-9]+:/         { n = back($2); if (n != $2) $2 = n }
        /^default:(user|group):[0-9]+:/ { n = back($3); if (n != $3) $3 = n }
        { print }'
}








############################################################
# shift_acls
############################################################
#
# Moves the ids inside the ACL entries of one upper layer
# back and prints how many paths carried ACLs. getfacl
# dumps only paths with extended ACLs; the dump is kept
# next to the manifest before and after the rewrite, and
# setfacl restores the rewritten one without touching any
# owner, so the layer's root still gets its turn last.
# Without the acl package nothing can be rewritten, so it
# only warns when coreutils ls marks a path as carrying an
# ACL (the "+" after its mode).
#
# Used by:
#   - shift_upper_back (below)
############################################################

shift_acls() {
    local upper=$1 manifest=$2
    if ! command -v getfacl > /dev/null || ! command -v setfacl > /dev/null; then
        if sudo find "$upper" -xdev ! -type l -exec ls -ld -- {} + 2> /dev/null | grep -q '^[^ ]\{10\}+'; then
            echo "  WARNING: paths in $upper carry ACLs, but the acl package is not installed — their ACL entries were not shifted" >&2
        fi
        echo 0
        return 0
    fi

    sudo getfacl -R -s -p -n "$upper" 2> /dev/null | sudo tee "$manifest.acl-before" > /dev/null
    if ! sudo test -s "$manifest.acl-before"; then
        sudo rm -f "$manifest.acl-before"
        echo 0
        return 0
    fi
    sudo cat "$manifest.acl-before" | shift_acl_dump | sudo tee "$manifest.acl-after" > /dev/null
    sudo setfacl --restore="$manifest.acl-after" || return 1
    sudo grep -c '^# file:' "$manifest.acl-before"
}








############################################################
# shift_upper_back
############################################################
#
# Shifts one stopped container's upper layer back: every id
# from the sysbox range (or the wrapped one) moves down by
# SB_BASE and every other id stays, so a run that was cut
# off can simply be repeated. chown clears setuid/setgid
# bits and can't touch ACLs, so both are taken care of
# around it, as sysbox-mgr's own chown does; file
# capabilities are dropped by the chown, as they are on
# every sysbox start anyway. Owners move with one find per
# distinct uid:gid pair, which stays fast on layers with
# tens of thousands of files. The layer's root directory
# goes last: sysbox judges the whole rootfs by that
# directory's owner, so a run cut off half-way still looks
# pre-shifted and sysbox won't add its offset on top of the
# half-done layer.
#
# Every changed path is appended to the manifest as old
# owner, new owner and path. It prints the counters shifted,
# acls and unmapped — paths whose ids are still outside 0 to
# 65535 afterwards, which the VM sees as nobody either way.
#
# Used by:
#   - heal_running, heal_stopped, heal_boot (below)
############################################################

shift_upper_back() {
    local upper=$1 manifest=$2 entry pair u g nu ng count acls unmapped total=0 failed=0 suid=() pairs=()


    # STEP 1: note the setuid/setgid files before chown clears their bits
    # ===================================================================
    mapfile -d '' suid < <(sudo find "$upper" -xdev -type f \( -perm -4000 -o -perm -2000 \) -printf '%m %p\0')


    # STEP 2: the ACL entries; setfacl leaves every owner alone
    # =========================================================
    acls=$(shift_acls "$upper" "$manifest") || return 1


    # STEP 3: the owners, one find per distinct uid:gid pair, the root excluded
    # =========================================================================
    mapfile -t pairs < <(sudo find "$upper" -xdev -mindepth 1 \( "${IN_RANGE[@]}" \) -printf '%U %G\n' | sort -u)
    for pair in "${pairs[@]}"; do
        read -r u g <<< "$pair"
        nu=$(unshift "$u")
        ng=$(unshift "$g")
        count=$(sudo find "$upper" -xdev -mindepth 1 -uid "$u" -gid "$g" -printf "$u:$g\t$nu:$ng\t%p\n" | sudo tee -a "$manifest" | wc -l)
        sudo find "$upper" -xdev -mindepth 1 -uid "$u" -gid "$g" -exec chown -h "$nu:$ng" {} + || return 1
        total=$((total + count))
    done


    # STEP 4: the setuid/setgid bits back
    # ===================================
    for entry in "${suid[@]}"; do
        if ! sudo chmod "${entry%% *}" "${entry#* }"; then
            echo "  ERROR: could not restore mode ${entry%% *} of ${entry#* }" >&2
            failed=1
        fi
    done


    # STEP 5: the layer's root last
    # =============================
    read -r u g < <(sudo stat -c '%u %g' "$upper")
    nu=$(unshift "$u")
    ng=$(unshift "$g")
    if [ "$nu:$ng" != "$u:$g" ]; then
        printf '%s\t%s\t%s\n' "$u:$g" "$nu:$ng" "$upper" | sudo tee -a "$manifest" > /dev/null
        sudo chown -h "$nu:$ng" "$upper" || return 1
        total=$((total + 1))
    fi

    unmapped=$(sudo find "$upper" -xdev \( -uid +$((SB_SIZE - 1)) -o -gid +$((SB_SIZE - 1)) \) | wc -l)
    echo "shifted=$total acls=$acls unmapped=$unmapped"
    return $failed
}








############################################################
# upper_is_shifted
############################################################
#
# True when a stopped container's upper layer is still
# shifted, judged the way sysbox-runc judges it at the next
# start: by the owner of the layer's root directory. Paths
# below the root don't count. After a clean stop sysbox
# leaves the content of its own special dirs shifted in the
# layer (/var/lib/docker when it is not a bind mount, and
# the kubelet, k3s, rke2 and buildkit dirs), which is normal
# and was seen with Sysbox 0.7.1. A shift-back that was cut
# off half-way still counts as stuck, because
# shift_upper_back moves the root last.
#
# Used by:
#   - assess (below) — stopped containers
#   - heal_running (below) — to see whether sysbox-mgr
#     reverted the layer by itself after all
#   - heal_boot (below)
############################################################

upper_is_shifted() {
    local u g
    read -r u g < <(sudo stat -c '%u %g' "$1" 2> /dev/null) || return 1
    [ "$(unshift "$u")" != "$u" ] || [ "$(unshift "$g")" != "$g" ]
}








############################################################
# image_mapping
############################################################
#
# Tells whether a running container sees its image layers
# ID-mapped and prints "mapped", "unmapped" or "unknown".
# The probes are up to 12 root-owned files of the base image
# layer that the upper layer holds nothing for (no copy, no
# whiteout), so the VM sees them straight from the image;
# they are stat'ed inside the VM, so the verdict is what the
# VM itself sees. Most of them have to show up as nobody
# (65534) to count as unmapped, so a single file a student
# replaced can't sway it. "unknown" means there was nothing
# to probe or the VM could not run stat.
#
# Used by:
#   - assess (below) — running containers
#   - heal_running (below) — the check after the restart
############################################################

image_mapping() {
    local name=$1 upper base owner probes=() nobody=0 total=0
    upper=$(sudo docker inspect -f '{{.GraphDriver.Data.UpperDir}}' "$name" 2> /dev/null)
    base=$(sudo docker inspect -f '{{.GraphDriver.Data.LowerDir}}' "$name" 2> /dev/null | tr ':' '\n' | tail -n 1)
    if [ -z "$upper" ] || [ -z "$base" ] || ! sudo test -d "$base"; then
        echo unknown
        return
    fi

    mapfile -t probes < <(LC_ALL=C comm -23 \
        <(sudo find "$base" -xdev -type f -user 0 -printf '/%P\n' | LC_ALL=C sort) \
        <(sudo find "$upper" -xdev -printf '/%P\n' | LC_ALL=C sort) | head -n 12)

    if [ ${#probes[@]} -gt 0 ]; then
        for owner in $(sudo docker exec "$name" stat -c %u -- "${probes[@]}" 2> /dev/null); do
            total=$((total + 1))
            [ "$owner" = 65534 ] && nobody=$((nobody + 1))
        done
    fi

    if [ "$total" -eq 0 ]; then
        echo unknown
    elif [ $((nobody * 2)) -gt "$total" ]; then
        echo unmapped
    else
        echo mapped
    fi
}








############################################################
# wait_for_unregister
############################################################
#
# Waits up to 30 seconds for sysbox-mgr to log that it has
# unregistered a container that was just stopped. When
# sysbox-mgr does hold a revert record it chowns the layer
# back before writing that line, so once the line is there
# nothing else touches the upper layer and the shift-back
# can't race it — two shifts on the same layer would push
# its ids out of range.
#
# Used by:
#   - heal_running (below)
############################################################

wait_for_unregister() {
    local id12=${1:0:12} since=$2
    for _ in $(seq 30); do
        if sudo journalctl -u sysbox-mgr --since "@$since" -o cat --no-pager 2> /dev/null | grep -q "unregistered container $id12"; then
            return 0
        fi
        sleep 1
    done
    return 1
}








############################################################
# wait_for_boot
############################################################
#
# Waits up to 180 seconds for the systemd inside a freshly
# started VM to finish booting: "running", or "degraded"
# when one of the student's units failed. It polls rather
# than using systemctl --wait, because right after docker
# start systemd isn't reachable yet and systemctl gives up
# at once instead of waiting — the VMs need about 4 seconds
# to boot, and sshd's socket is not listening before that.
# Containers whose PID 1 is not systemd have nothing to wait
# for.
#
# Used by:
#   - heal_running (below)
############################################################

wait_for_boot() {
    local name=$1 state
    [ "$(sudo docker exec "$name" cat /proc/1/comm 2> /dev/null)" = systemd ] || return 0
    for _ in $(seq 90); do
        state=$(sudo docker exec "$name" systemctl is-system-running 2> /dev/null)
        case $state in
            running|degraded) return 0 ;;
        esac
        sleep 2
    done
    return 1
}








############################################################
# open_log_dir
############################################################
#
# Creates this run's log directory through sudo (the guard
# runs as root, and _LOGS may not exist yet) and hands it to
# the owner of the stack directory, so the operator can read
# and clear the logs without sudo.
#
# Used by:
#   - heal_running, heal_stopped, heal_boot (below)
############################################################

open_log_dir() {
    sudo mkdir -p "$LOG_DIR"
    sudo chown --reference="$SCRIPT_DIR" "$SCRIPT_DIR/_LOGS" "$SCRIPT_DIR/_LOGS/fixContainers" "$LOG_DIR"
}








############################################################
# heal_running
############################################################
#
# Heals one running, stuck VM: stops it, waits for
# sysbox-mgr to let go of it, shifts its upper layer back,
# starts it and checks that the image is ID-mapped again
# and that sshd answers on port 22 inside it. When the
# layer turns out to be reverted by sysbox-mgr itself the
# VM was not stuck after all and it is just started again.
# A failed shift-back leaves the VM stopped on purpose: a
# half-shifted layer is no use to the student, and a rerun
# of this script finishes it.
#
# Used by:
#   - main (below)
############################################################

heal_running() {
    local name=$1 id upper since summary mapping banner


    # STEP 1: stop the VM and wait until sysbox-mgr is done with it
    # =============================================================
    id=$(sudo docker inspect -f '{{.Id}}' "$name")
    upper=$(sudo docker inspect -f '{{.GraphDriver.Data.UpperDir}}' "$name")
    since=$(date +%s)
    echo "  Stopping (inner containers get up to 60s to shut down) ..."
    if ! sudo docker stop -t 60 "$name" > /dev/null; then
        echo "  ERROR: docker stop failed, nothing was changed"
        return 1
    fi
    if ! wait_for_unregister "$id" "$since"; then
        echo "  ERROR: sysbox-mgr did not unregister the container within 30s — starting it again untouched"
        sudo docker start "$name" > /dev/null
        return 1
    fi


    # STEP 2: shift the upper layer back, unless sysbox-mgr already did
    # =================================================================
    if ! upper_is_shifted "$upper"; then
        echo "  sysbox-mgr reverted the upper layer itself, so it was not stuck — starting it again"
        sudo docker start "$name" > /dev/null
        return 0
    fi
    open_log_dir
    if ! summary=$(shift_upper_back "$upper" "$LOG_DIR/$name.tsv"); then
        echo "  ERROR: the shift-back failed — $name is left STOPPED on purpose, rerun this script for it"
        return 1
    fi
    echo "  Upper layer shifted back: $summary"


    # STEP 3: start it, sysbox now ID-maps the image again
    # ====================================================
    echo "  Starting ..."
    if ! sudo docker start "$name" > /dev/null; then
        echo "  ERROR: docker start failed — the layer is shifted back, so a plain docker start is safe"
        return 1
    fi

    if ! wait_for_boot "$name"; then
        echo "  WARNING: systemd inside the VM had not finished booting after 180s, checking anyway"
    fi


    # STEP 4: verify from inside the VM
    # =================================
    mapping=$(image_mapping "$name")
    if [ "$mapping" != mapped ]; then
        echo "  FAILED: image layers are '$mapping' inside the VM after the restart"
        return 1
    fi
    echo "  ✓ Image layers are ID-mapped (files of the image are owned by root again)"

    # sshd is socket-activated: only a connection starts ssh.service (which also creates
    # /run/sshd, so a bare sshd -t fails before that) and makes it load the host keys;
    # the retries cover a boot that wait_for_boot gave up on
    if sudo docker exec "$name" systemctl cat ssh.socket > /dev/null 2>&1; then
        for _ in $(seq 10); do
            banner=$(sudo docker exec "$name" timeout 10 bash -c 'exec 3<>/dev/tcp/127.0.0.1/22; head -c 7 <&3' 2> /dev/null)
            [ "$banner" = "SSH-2.0" ] && break
            sleep 3
        done
        if [ "$banner" != "SSH-2.0" ]; then
            echo "  FAILED: sshd does not answer on port 22 inside the VM (tried for 30s)"
            return 1
        fi
        echo "  ✓ sshd answers on port 22 inside the VM"
    fi
    return 0
}








############################################################
# heal_stopped
############################################################
#
# Shifts back the upper layer of a stuck VM that is already
# stopped and leaves it stopped — its next start, from the
# panel or by docker, then gets the ID-mapping again.
#
# Used by:
#   - main (below)
############################################################

heal_stopped() {
    local name=$1 upper summary
    upper=$(sudo docker inspect -f '{{.GraphDriver.Data.UpperDir}}' "$name")
    open_log_dir
    if ! summary=$(shift_upper_back "$upper" "$LOG_DIR/$name.tsv"); then
        echo "  ERROR: the shift-back failed, rerun this script for $name before starting it"
        return 1
    fi
    echo "  Upper layer shifted back, left stopped: $summary"
}








############################################################
# heal_boot
############################################################
#
# The --boot mode: fixes every stuck sysbox container while
# docker is down, which is why it reads docker's on-disk
# state instead of asking the daemon — the runtime from each
# container's hostconfig.json, its name from config.v2.json
# and its overlay2 directory from the layerdb mount-id. With
# docker stopped no container runs, so a shifted id in an
# upper layer can only be a missed revert (a crash, or
# sysbox restarted under the running VMs). A rootfs that is
# still mounted is left alone all the same, in case
# something does run it. Together with --dry-run it only
# reports, and then it may run while docker is up — the way
# to try the guard out safely.
#
# Used by:
#   - host-config/systemd/sysbox-rootfs-guard.service —
#     before every start of docker.service
############################################################

heal_boot() {
    local cfg dir id name mount_id upper summary failed=0
    if [ "$DRY_RUN" -eq 0 ] && systemctl is-active --quiet docker.service; then
        echo "ERROR: --boot is only safe while docker is stopped"
        return 1
    fi

    while IFS= read -r cfg; do
        dir=${cfg%/hostconfig.json}
        id=${dir##*/}
        sudo grep -q '"Runtime":"sysbox-runc"' "$cfg" || continue

        name=$(sudo grep -o '"Name":"/[^"]*"' "$dir/config.v2.json" 2> /dev/null | head -n 1 | sed 's|^"Name":"/||; s|"$||')
        name=${name:-$id}
        mount_id=$(sudo cat "$DOCKER_ROOT/image/overlay2/layerdb/mounts/$id/mount-id" 2> /dev/null) || continue
        upper="$DOCKER_ROOT/overlay2/$mount_id/diff"
        sudo test -d "$upper" || continue
        if sudo mountpoint -q "$DOCKER_ROOT/overlay2/$mount_id/merged" 2> /dev/null; then
            echo "$name: rootfs is mounted, skipped"
            continue
        fi

        upper_is_shifted "$upper" || continue
        if [ "$DRY_RUN" -eq 1 ]; then
            echo "$name: stuck, would be shifted back"
            continue
        fi
        open_log_dir
        if summary=$(shift_upper_back "$upper" "$LOG_DIR/$name.tsv"); then
            echo "$name: upper layer shifted back ($summary)"
        else
            echo "$name: ERROR, the shift-back failed"
            failed=1
        fi
    done < <(sudo find "$DOCKER_ROOT/containers" -mindepth 2 -maxdepth 2 -name hostconfig.json)
    return $failed
}








############################################################
# assess
############################################################
#
# Sorts one container into RUNNING_STUCK, STOPPED_STUCK or
# neither and prints its row of the plan. Containers that do
# not run under sysbox-runc are never touched.
#
# Used by:
#   - main (below)
############################################################

assess() {
    local name=$1 runtime state mapping upper
    runtime=$(sudo docker inspect -f '{{.HostConfig.Runtime}}' "$name" 2> /dev/null)
    if [ -z "$runtime" ]; then
        printf "  %-30s %-9s %s\n" "$name" "-" "no such container"
        return
    fi
    state=$(sudo docker inspect -f '{{.State.Status}}' "$name")
    if [ "$runtime" != sysbox-runc ]; then
        printf "  %-30s %-9s %s\n" "$name" "$state" "not a sysbox container, skipped"
        return
    fi

    if [ "$state" = running ]; then
        mapping=$(image_mapping "$name")
        case $mapping in
            unmapped) RUNNING_STUCK+=("$name"); printf "  %-30s %-9s %s\n" "$name" "$state" "STUCK — image shows up as nobody, will be restarted" ;;
            mapped)   printf "  %-30s %-9s %s\n" "$name" "$state" "ok" ;;
            *)        printf "  %-30s %-9s %s\n" "$name" "$state" "could not tell, skipped" ;;
        esac
    else
        upper=$(sudo docker inspect -f '{{.GraphDriver.Data.UpperDir}}' "$name")
        if upper_is_shifted "$upper"; then
            STOPPED_STUCK+=("$name")
            printf "  %-30s %-9s %s\n" "$name" "$state" "STUCK — upper layer was never reverted, will be shifted back"
        else
            printf "  %-30s %-9s %s\n" "$name" "$state" "ok"
        fi
    fi
}








############################################################
# main
############################################################
#
# Checks every target first and prints the whole plan, so
# nothing is restarted before the operator has seen which
# VMs are stuck; then heals the stopped ones (cheap, no
# downtime) and after them the running ones, one at a time.
# sudo is asked for once up front, so a password prompt
# can't turn up in the middle of a heal. The exit code is
# non-zero when any VM failed to heal.
#
# Used by:
#   - the bottom of the file, when the script is executed
############################################################

main() {
    local arg name
    DRY_RUN=0
    ASSUME_YES=0
    BOOT=0
    TARGETS=()
    RUNNING_STUCK=()
    STOPPED_STUCK=()
    FAILED=()
    for arg in "$@"; do
        case $arg in
            --dry-run) DRY_RUN=1 ;;
            --yes|-y)  ASSUME_YES=1 ;;
            --boot)    BOOT=1 ;;
            -h|--help) echo "Usage: $0 [--dry-run] [--yes] [--boot] [VM number | container name ...]"; return 0 ;;
            [0-9]*)    TARGETS+=("hosting-users-dind-$arg") ;;
            *)         TARGETS+=("$arg") ;;
        esac
    done

    # sudo true, not sudo -v: -v wants a password unless every sudoers entry is NOPASSWD
    if [ "$EUID" -ne 0 ]; then
        echo "This script uses sudo for docker and for the layer changes. Requesting sudo access..."
        sudo true || return 1
    fi

    if [ "$BOOT" -eq 1 ]; then
        heal_boot
        return
    fi

    if [ ${#TARGETS[@]} -eq 0 ]; then
        mapfile -t TARGETS < <(sudo docker ps -a --format '{{.Names}}' | grep -E "$VM_PATTERN" | sort -V)
    fi
    if [ ${#TARGETS[@]} -eq 0 ]; then
        echo "ERROR: No containers found matching pattern '$VM_PATTERN'"
        return 1
    fi

    echo "======================================================================="
    echo "Checking ${#TARGETS[@]} container(s) (sysbox id range $SB_BASE+$SB_SIZE)"
    echo "======================================================================="
    for name in "${TARGETS[@]}"; do
        assess "$name"
    done
    echo ""

    if [ $((${#RUNNING_STUCK[@]} + ${#STOPPED_STUCK[@]})) -eq 0 ]; then
        echo "Nothing to heal."
        return 0
    fi
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "Dry run: ${#RUNNING_STUCK[@]} running VM(s) would be restarted, ${#STOPPED_STUCK[@]} stopped VM(s) shifted back."
        return 0
    fi
    if [ "$ASSUME_YES" -eq 0 ] && [ -t 0 ]; then
        echo "${#RUNNING_STUCK[@]} running VM(s) will be restarted (about a minute each), ${#STOPPED_STUCK[@]} stopped VM(s) shifted back."
        echo "Press <ENTER> to continue or <CTRL>+C to cancel"
        read -r
    fi

    for name in "${STOPPED_STUCK[@]}"; do
        echo "--- $name (stopped)"
        heal_stopped "$name" || FAILED+=("$name")
    done
    for name in "${RUNNING_STUCK[@]}"; do
        echo "--- $name (running)"
        heal_running "$name" || FAILED+=("$name")
    done

    echo ""
    echo "======================================================================="
    echo "Healed: $((${#RUNNING_STUCK[@]} + ${#STOPPED_STUCK[@]} - ${#FAILED[@]}))   Failed: ${#FAILED[@]} ${FAILED[*]}"
    [ -d "$LOG_DIR" ] && echo "Ownership changes logged in: $LOG_DIR"
    echo "======================================================================="
    [ ${#FAILED[@]} -eq 0 ]
}








# Run only when executed — sourcing the file just defines the functions
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
