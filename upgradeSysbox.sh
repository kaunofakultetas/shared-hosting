#!/bin/bash

############################################################
#  [*] upgradeSysbox — move the host to another Sysbox
#      release without losing a single student VM
#
#  A VM is a docker container plus its overlayfs layers and
#  its SERVERS/<id> directories, and the sysbox-ce package
#  owns none of that, so the package can be swapped under
#  the VMs — with docker stopped. Stopping docker stops every
#  container while sysbox still runs, so sysbox-mgr shifts
#  each VM's upper layer back cleanly, and the package's
#  scripts then never meet a running docker. With docker up
#  the installer restarts sysbox under the running VMs (the
#  bug fixContainers.sh heals), and on this host it even
#  aborts: daemon.json has no "bip", which the installer
#  reads as "docker must be restarted", so it refuses while
#  containers exist and advises to docker rm all of them —
#  which would destroy every VM.
#
#  A run downloads the target release and the installed one
#  (the way back), checks both packages and that apt can
#  install the target, shows the plan and waits for a
#  confirmation. Then it stops docker, makes sure every VM
#  layer is shifted back, purges the old package and installs
#  the new one (needrestart suspended, no prompts), verifies
#  the version, the sysbox uid range and daemon.json
#  (restored from its backup when the installer changed it),
#  starts docker and waits until every container that ran
#  before runs again. When the new package can't be installed
#  or doesn't come up, the old one is put back; whatever
#  fails, docker is started again as soon as a working sysbox
#  is in place. Each run is logged to _LOGS/upgradeSysbox/.
#
#  Without arguments the target is the latest Sysbox
#  release; a version number pins one, which is also the way
#  back to an older release. --check stops after the
#  preparation, without any downtime; --yes skips the
#  confirmation, which is required when no terminal is
#  attached. The platform is down from the docker stop to the
#  docker start, a few minutes. The sysbox user stays,
#  although the Sysbox docs remove it between releases: it
#  owns the uid range every VM is mapped to.
#
#  Like fixContainers.sh it runs as the operator and calls
#  sudo for everything that needs root.
############################################################


RELEASES_API="https://api.github.com/repos/nestybox/sysbox/releases"
DEB_CACHE=/var/cache/sysbox-debs
SCRIPT_DIR=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
LOG_DIR="$SCRIPT_DIR/_LOGS/upgradeSysbox"
RUN_ID=$(date +'%Y%m%d-%H%M%S')
LOG_FILE="$LOG_DIR/$RUN_ID.log"

# needrestart's apt hook stays out of the swap, and debconf must never wait for a terminal
APT=(sudo env NEEDRESTART_SUSPEND=1 DEBIAN_FRONTEND=noninteractive apt-get -y)

# Set while docker is down, so fail knows to bring the platform back; OLD_DEB is the way back
DOCKER_STOPPED=0
OLD_DEB=""








############################################################
# norm_version
############################################################
#
# Reduces the ways Sysbox spells a version to the bare
# release number: release tags carry a leading "v", package
# versions a ".linux" suffix and some package file names a
# "-0" build suffix.
#
# Used by:
#   - installed_version, release_deb_url, fetch_deb (below)
############################################################

norm_version() {
    local v=${1#v}
    v=${v%.linux}
    echo "${v%%-*}"
}








############################################################
# installed_version
############################################################
#
# The release number of the installed sysbox-ce package, or
# nothing when it is not installed.
#
# Used by:
#   - fail, main (below)
############################################################

installed_version() {
    local v
    v=$(dpkg-query -W -f='${Status} ${Version}' sysbox-ce 2> /dev/null) || return 0
    [[ "$v" == "install ok installed "* ]] && norm_version "${v##* }"
}








############################################################
# release_deb_url
############################################################
#
# Asks the GitHub releases API for one Sysbox release — the
# latest one when no version is given — and prints its
# release number and the download URL of its package for
# this host's architecture. The URL is taken from the
# release's asset list because the package file names do not
# follow one pattern across releases.
#
# Used by:
#   - main (below)
############################################################

release_deb_url() {
    local version=$1 arch=$2 json url
    if [ -n "$version" ]; then
        json=$(curl -fsSL "$RELEASES_API/tags/v$(norm_version "$version")") || return 1
    else
        json=$(curl -fsSL "$RELEASES_API/latest") || return 1
    fi
    url=$(jq -r --arg a "linux_$arch.deb" '.assets[] | select(.name | endswith($a)) | .browser_download_url' <<< "$json" | head -n 1)
    [ -n "$url" ] || return 1
    echo "$(norm_version "$(jq -r .tag_name <<< "$json")") $url"
}








############################################################
# fetch_deb
############################################################
#
# Downloads a package into DEB_CACHE unless it is there
# already, checks that it really is the sysbox-ce package of
# the expected release and architecture, and prints its
# path. Packages stay in the cache, so a later way back
# needs no network.
#
# Used by:
#   - main (below)
############################################################

fetch_deb() {
    local url=$1 version=$2 arch=$3 deb
    deb="$DEB_CACHE/$(basename "$url")"
    sudo mkdir -p "$DEB_CACHE"
    if ! sudo test -s "$deb"; then
        if ! sudo curl -fsSL -o "$deb.part" "$url"; then
            sudo rm -f "$deb.part"
            return 1
        fi
        sudo mv "$deb.part" "$deb"
    fi
    [ "$(dpkg-deb -f "$deb" Package)" = sysbox-ce ] || return 1
    [ "$(dpkg-deb -f "$deb" Architecture)" = "$arch" ] || return 1
    [ "$(norm_version "$(dpkg-deb -f "$deb" Version)")" = "$version" ] || return 1
    echo "$deb"
}








############################################################
# sysbox_up
############################################################
#
# True when the sysbox runtime is installed and all three of
# its services run — the condition for letting docker start
# the sysbox containers again. Each service is asked on its
# own: systemctl is-active is already happy when one of
# several units is active.
#
# Used by:
#   - swap_package, fail (below)
############################################################

sysbox_up() {
    local unit
    command -v sysbox-runc > /dev/null || return 1
    for unit in sysbox.service sysbox-mgr.service sysbox-fs.service; do
        systemctl is-active --quiet "$unit" || return 1
    done
}








############################################################
# swap_package
############################################################
#
# Purges the installed sysbox-ce and installs the given
# package in its place; the sysbox user is kept. Purging is
# what the Sysbox docs ask for between releases; it also
# drops the runtime from daemon.json, which the install puts
# back. It fails when either step fails or when the services
# are not up 30 seconds after the install.
#
# Used by:
#   - main (below) — for the upgrade and for the way back
############################################################

swap_package() {
    local deb=$1
    "${APT[@]}" purge sysbox-ce || return 1
    "${APT[@]}" install --allow-downgrades "$deb" || return 1
    for _ in $(seq 15); do
        sysbox_up && return 0
        sleep 2
    done
    return 1
}








############################################################
# restore_daemon_json
############################################################
#
# Compares daemon.json with the copy taken before the swap,
# key order aside, and puts the copy back when they differ.
# The installer only ever adds the sysbox runtime, which the
# copy already holds, or its own "bip" and address pool, and
# on this host its "bip" of 172.20.0.1/16 would overlap the
# 172.20.0.0/16 pool docker hands its networks out of. The
# difference is printed first, so a change a new release
# really needs does not get lost unseen.
#
# Used by:
#   - main (below)
############################################################

restore_daemon_json() {
    local before="$LOG_DIR/$RUN_ID.daemon.json"
    [ -f "$before" ] || return 0
    if ! diff <(jq -S . "$before") <(jq -S . /etc/docker/daemon.json 2> /dev/null) > /dev/null; then
        echo "daemon.json was changed by the installer:"
        diff <(jq -S . "$before") <(jq -S . /etc/docker/daemon.json 2> /dev/null)
        sudo cp "$before" /etc/docker/daemon.json && echo "  -> restored from $before"
    fi
}








############################################################
# fail
############################################################
#
# Ends a run that went wrong. While docker is down it is
# started again as soon as a working sysbox is installed, so
# a failed upgrade costs a few minutes of downtime and
# nothing more. Without a working sysbox docker is left
# stopped, because no VM could start anyway, and the way to
# put the old package back by hand is printed.
#
# Used by:
#   - main (below), and the INT/TERM trap it sets
############################################################

fail() {
    trap - INT TERM
    echo ""
    echo "ERROR: $1"
    if [ "$DOCKER_STOPPED" -eq 1 ]; then
        if sysbox_up; then
            echo "Starting docker again on sysbox $(installed_version) ..."
            sudo systemctl start docker.service && DOCKER_STOPPED=0
        else
            echo "No working sysbox is installed, so docker was left stopped. Put the old package back with:"
            echo "  sudo apt-get install -y --allow-downgrades $OLD_DEB && sudo systemctl start docker"
        fi
    fi
    echo "Log: $LOG_FILE"
    exit 1
}








############################################################
# main
############################################################
#
# The upgrade itself, in the order the file header tells
# it. Nothing before STEP 2 causes any downtime, which is
# what --check stops short of.
#
# Used by:
#   - the bottom of the file, when the script is executed
############################################################

main() {
    local arg tool target="" check=0 yes=0 arch installed target_url old_url target_deb subuid_before missing running_before=()
    for arg in "$@"; do
        case $arg in
            --check)   check=1 ;;
            --yes|-y)  yes=1 ;;
            -h|--help) echo "Usage: $0 [--check] [--yes] [version]"; return 0 ;;
            *)         target=$arg ;;
        esac
    done

    echo "This script uses sudo for docker, apt and the VM layers. Requesting sudo access..."
    sudo true || return 1
    mkdir -p "$LOG_DIR"
    exec > >(tee -a "$LOG_FILE") 2>&1


    # STEP 1: prepare and check everything, still without downtime
    # ============================================================
    for tool in curl jq dpkg-deb apt-get; do
        command -v "$tool" > /dev/null || fail "$tool is not installed"
    done
    [ -x "$SCRIPT_DIR/fixContainers.sh" ] || fail "fixContainers.sh is missing next to this script"
    installed=$(installed_version)
    [ -n "$installed" ] || fail "the sysbox-ce package is not installed"
    arch=$(dpkg --print-architecture)

    read -r target target_url < <(release_deb_url "$target" "$arch") \
        || fail "could not find the Sysbox release '${target:-latest}' for $arch on GitHub"
    if [ "$target" = "$installed" ]; then
        echo "Sysbox $installed is already installed, nothing to do."
        return 0
    fi
    read -r _ old_url < <(release_deb_url "$installed" "$arch") \
        || fail "could not find the installed Sysbox $installed on GitHub, so there would be no way back"

    echo "Downloading the packages into $DEB_CACHE ..."
    target_deb=$(fetch_deb "$target_url" "$target" "$arch") \
        || fail "the download of Sysbox $target failed or is not the expected package"
    OLD_DEB=$(fetch_deb "$old_url" "$installed" "$arch") \
        || fail "the download of Sysbox $installed (the way back) failed or is not the expected package"
    apt-get install -s "$target_deb" > /dev/null 2>&1 \
        || fail "apt could not install $target_deb (see: apt-get install -s $target_deb)"

    subuid_before=$(grep '^sysbox:' /etc/subuid)
    [ -f /etc/docker/daemon.json ] && cp /etc/docker/daemon.json "$LOG_DIR/$RUN_ID.daemon.json"
    if systemctl is-active --quiet docker.service; then
        mapfile -t running_before < <(sudo docker ps --format '{{.Names}}' | sort)
    fi

    echo "======================================================================="
    echo "Sysbox $installed -> $target"
    echo "  package:    $target_deb"
    echo "  way back:   $OLD_DEB"
    echo "  running:    ${#running_before[@]} container(s), started again afterwards"
    echo "  uid range:  $subuid_before (kept)"
    echo "======================================================================="
    if [ "$check" -eq 1 ]; then
        echo "Check only: everything is ready for the upgrade, nothing was changed."
        return 0
    fi
    if [ "$yes" -eq 0 ]; then
        [ -t 0 ] || fail "no terminal to confirm on — pass --yes to run unattended"
        echo "Docker will be stopped: every VM, the control panel and all student apps are down until it runs again (a few minutes)."
        echo "Press <ENTER> to continue or <CTRL>+C to cancel"
        read -r
    fi


    # STEP 2: stop docker, every container stops while sysbox still runs
    # ==================================================================
    trap 'fail "interrupted"' INT TERM
    DOCKER_STOPPED=1
    echo "Stopping docker ..."
    sudo systemctl stop docker.socket docker.service || fail "docker did not stop"


    # STEP 3: no VM layer may still be shifted while sysbox is swapped
    # ================================================================
    "$SCRIPT_DIR/fixContainers.sh" --boot || fail "fixContainers.sh --boot could not shift every VM layer back"
    if "$SCRIPT_DIR/fixContainers.sh" --boot --dry-run | grep -q ': stuck'; then
        fail "some VM layers are still shifted (see ./fixContainers.sh --boot --dry-run)"
    fi


    # STEP 4: swap the package; the old one goes back in when the new one fails
    # =========================================================================
    echo "Replacing sysbox $installed with $target ..."
    if ! swap_package "$target_deb"; then
        echo "Sysbox $target did not install or come up — putting $installed back ..."
        swap_package "$OLD_DEB" || fail "neither Sysbox $target nor $installed could be installed"
        restore_daemon_json
        fail "Sysbox $target could not be installed, the host stays on $installed"
    fi


    # STEP 5: verify the new sysbox before docker sees it
    # ===================================================
    [ "$(installed_version)" = "$target" ] || fail "dpkg reports Sysbox $(installed_version), not $target"
    if [ "$(grep '^sysbox:' /etc/subuid)" != "$subuid_before" ]; then
        echo "WARNING: the sysbox uid range changed to $(grep '^sysbox:' /etc/subuid)"
    fi
    restore_daemon_json
    echo "✓ Sysbox $target is installed and running"


    # STEP 6: start docker; the guard runs first, then the containers come back
    # =========================================================================
    echo "Starting docker ..."
    sudo systemctl start docker.service || fail "docker did not start"
    DOCKER_STOPPED=0
    trap - INT TERM
    echo "Waiting for the ${#running_before[@]} container(s) that ran before ..."
    for _ in $(seq 36); do
        missing=$(comm -23 <(printf '%s\n' "${running_before[@]}") <(sudo docker ps --format '{{.Names}}' | sort) | grep -c .)
        [ "$missing" -eq 0 ] && break
        sleep 5
    done
    if [ "$missing" -gt 0 ]; then
        echo "WARNING: not running again after 3 minutes:"
        comm -23 <(printf '%s\n' "${running_before[@]}") <(sudo docker ps --format '{{.Names}}' | sort) | sed 's/^/  /'
    fi


    # STEP 7: every VM must come up ID-mapped on the new sysbox
    # =========================================================
    "$SCRIPT_DIR/fixContainers.sh" --dry-run
    echo ""
    echo "======================================================================="
    echo "Sysbox upgraded: $installed -> $target   (log: $LOG_FILE)"
    echo "======================================================================="
}








# Run only when executed — sourcing the file just defines the functions
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
    main "$@"
fi
