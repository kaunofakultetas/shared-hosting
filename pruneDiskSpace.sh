#!/bin/bash

############################################################
#  [*] pruneDiskSpace — free the docker space nothing needs,
#      on the host and inside every running VM
#
#  On the host it removes the images no container uses,
#  running or stopped, and the whole build cache. docker
#  system prune is never run on the host, because it would
#  delete the stopped VMs themselves. Inside every running
#  VM it runs docker system prune -a -f --volumes: the
#  student's stopped containers go, and with them the
#  images, networks and build cache nothing else uses and
#  the anonymous volumes no container uses (the VMs run
#  docker 27, where --volumes leaves named volumes alone).
#  Running containers are never touched, and stopped VMs
#  are left as they are.
#
#  A VM is skipped when a container of its own system stack
#  — the sistema compose project: endpoint, Dockge,
#  FileBrowser, WebSSH2 — is not running: the prune would
#  delete it, and without it the panel can't reach the VM.
#  Start the stack first and run this again.
#
#  It shows what each part would free (docker system df),
#  asks once, prunes, and prints what each part freed and
#  the free disk space before and after. --dry-run stops
#  after the estimate, --yes skips the confirmation, which
#  is required when no terminal is attached. Everything it
#  prints, and the full prune output with every deleted id,
#  goes to _LOGS/pruneDiskSpace/<timestamp>.log.
#
#  Like the other scripts it runs as the operator and calls
#  sudo for everything that needs root.
############################################################


VM_PATTERN="^hosting-users-dind-"
SCRIPT_DIR=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
LOG_DIR="$SCRIPT_DIR/_LOGS/pruneDiskSpace"
LOG_FILE="$LOG_DIR/$(date +'%Y%m%d-%H%M%S').log"








############################################################
# say
############################################################
#
# Prints a line and appends it to the log. Everything goes
# through the script itself, so the log keeps the order in
# which things happened.
#
# Used by:
#   - prune_step, prune_vm, main (below)
############################################################

say() {
    printf '%s\n' "$*"
    printf '%s\n' "$*" >> "$LOG_FILE"
}








############################################################
# running_vms
############################################################
#
# The names of the VMs that are running right now, in VM
# number order.
#
# Used by:
#   - main (below)
############################################################

running_vms() {
    sudo docker ps --format '{{.Names}}' | grep -E "$VM_PATTERN" | sort -V
}








############################################################
# reclaimable
############################################################
#
# What docker system df reports as reclaimable, on the host
# (no argument) or inside one VM, as one readable line. The
# host line lists images and build cache only, the two
# things pruned there.
#
# Used by:
#   - main (below)
############################################################

reclaimable() {
    local vm=$1 docker=(sudo docker)
    [ -n "$vm" ] && docker=(sudo docker exec "$vm" docker)
    "${docker[@]}" system df --format '{{.Type}}|{{.Reclaimable}}' 2> /dev/null | awk -F'|' -v vm="$vm" '
        {
            sub(/ \(.*\)/, "", $2)
            type = tolower($1)
            sub(/^local /, "", type)
            if (type == "containers") type = "stopped containers"
            if (vm == "" && type != "images" && type != "build cache") next
            line = line (line ? ", " : "") type " " $2
        }
        END { print (line ? line : "docker does not answer") }'
}








############################################################
# sistema_not_running
############################################################
#
# Prints the containers of a VM's system stack (the sistema
# compose project) that are not running; nothing means the
# whole stack runs. Fails when the docker inside the VM does
# not answer.
#
# Used by:
#   - prune_vm (below)
############################################################

sistema_not_running() {
    local states
    states=$(sudo docker exec "$1" docker ps -a --filter label=com.docker.compose.project=sistema --format '{{.Names}} {{.State}}' 2> /dev/null) || return 1
    awk '$2 != "running" { print $1 }' <<< "$states"
}








############################################################
# prune_step
############################################################
#
# Runs one prune command, appends its full output — every
# deleted id — to the log and prints only its total, which
# image and system prunes call "Total reclaimed space" and
# the build cache prune "Total". Returns the command's exit
# code.
#
# Used by:
#   - prune_vm, main (below)
############################################################

prune_step() {
    local label=$1 out rc total
    shift
    out=$("$@" 2>&1)
    rc=$?
    printf '%s\n' "----- $label: $*" "$out" >> "$LOG_FILE"
    total=$(printf '%s\n' "$out" | grep -E '^Total( reclaimed space)?:' | tail -n 1 | sed -E 's/^Total( reclaimed space)?:[[:space:]]*//')
    if [ $rc -eq 0 ]; then
        say "$(printf '  %-26s freed %s' "$label" "${total:-0B}")"
    else
        say "$(printf '  %-26s FAILED (exit %s): %s' "$label" "$rc" "$(printf '%s\n' "$out" | tail -n 1)")"
    fi
    return $rc
}








############################################################
# prune_vm
############################################################
#
# Prunes the docker inside one running VM, unless its system
# stack is not fully running or its docker does not answer
# (see the file header). Returns non-zero when the VM was
# skipped or the prune failed.
#
# Used by:
#   - main (below)
############################################################

prune_vm() {
    local vm=$1 stopped
    if ! stopped=$(sistema_not_running "$vm"); then
        say "$(printf '  %-26s SKIPPED: the docker inside does not answer' "$vm")"
        return 1
    fi
    if [ -n "$stopped" ]; then
        say "$(printf '  %-26s SKIPPED: system stack not running (%s)' "$vm" "$(echo $stopped)")"
        return 1
    fi
    prune_step "$vm" sudo docker exec "$vm" docker system prune -a -f --volumes
}








############################################################
# main
############################################################
#
# Estimates first and asks once, then prunes the host and
# the running VMs one after the other and sums up what the
# disk gained. A VM that was skipped or failed is listed at
# the end and makes the exit code non-zero.
#
# Used by:
#   - the bottom of the file, when the script is executed
############################################################

main() {
    local arg vm free_before free_after dry_run=0 yes=0 vms=() failed=()
    for arg in "$@"; do
        case $arg in
            --dry-run) dry_run=1 ;;
            --yes|-y)  yes=1 ;;
            -h|--help) echo "Usage: $0 [--dry-run] [--yes]"; return 0 ;;
            *)         echo "Unknown argument: $arg"; return 1 ;;
        esac
    done

    echo "This script uses sudo for docker. Requesting sudo access..."
    sudo true || return 1
    mkdir -p "$LOG_DIR"


    # STEP 1: estimate what each part would free
    # ==========================================
    free_before=$(df -B1 --output=avail / | tail -n 1)
    mapfile -t vms < <(running_vms)
    say "======================================================================="
    say "Host: images no container uses and the build cache"
    say "  $(reclaimable)"
    say "Running VMs: docker system prune -a -f --volumes inside each"
    for vm in "${vms[@]}"; do
        say "$(printf '  %-26s %s' "$vm" "$(reclaimable "$vm")")"
    done
    say "======================================================================="
    if [ "$dry_run" -eq 1 ]; then
        say "Dry run: nothing was removed."
        return 0
    fi
    if [ "$yes" -eq 0 ]; then
        if [ ! -t 0 ]; then
            say "No terminal to confirm on — pass --yes to run unattended."
            return 1
        fi
        echo "Stopped containers inside the running VMs, and every image, volume and cache nothing uses, will be deleted."
        echo "Press <ENTER> to continue or <CTRL>+C to cancel"
        read -r
    fi


    # STEP 2: the host — unused images and the build cache, never containers
    # ======================================================================
    say "Host:"
    prune_step "images" sudo docker image prune -a -f || failed+=("host-images")
    prune_step "build cache" sudo docker builder prune -a -f || failed+=("host-build-cache")


    # STEP 3: every running VM, one after the other
    # =============================================
    say "VMs:"
    for vm in "${vms[@]}"; do
        prune_vm "$vm" || failed+=("$vm")
    done


    # STEP 4: what the disk gained
    # ============================
    free_after=$(df -B1 --output=avail / | tail -n 1)
    say "======================================================================="
    say "Free disk space: $(numfmt --to=iec "$free_before") -> $(numfmt --to=iec "$free_after") (+$(numfmt --to=iec $(( free_after > free_before ? free_after - free_before : 0 ))))"
    [ ${#failed[@]} -gt 0 ] && say "Not pruned: ${failed[*]}"
    say "Log with every deleted id: $LOG_FILE"
    say "======================================================================="
    [ ${#failed[@]} -eq 0 ]
}








# Run only when executed — sourcing the file just defines the functions
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
