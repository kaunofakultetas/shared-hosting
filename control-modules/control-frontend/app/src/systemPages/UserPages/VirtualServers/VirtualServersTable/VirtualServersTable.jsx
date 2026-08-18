// -----------------------------------------------------------
//  [*] VirtualServersTable — the VM card grid
//
//  Everything on the /vm page: the header with the count,
//  admin-only "Show other users" switch, the search box and
//  the New Server button, then one card per VM. The data and
//  the start/stop/delete actions live in useVirtualServers
//  (3-second poll, invalidation after every action); the
//  first load renders skeleton cards.
//
//  Search matches VM name, owner email, VM id, domain names,
//  public forward ports and container/stack names; the search
//  text and the other-users switch live in the URL
//  (?q=...&all=1) and the scroll spot in sessionStorage, so
//  opening a VM and coming back lands exactly where the user
//  left. Delete additionally requires the VM to be stopped
//  and a 3-second hold on the shared LongPressIconButton.
//
//  Split into (root component last):
//
//    useVirtualServers   — list query + start/stop/delete
//    vmMatchesQuery      — the search predicate
//    QuickActions        — start/stop + hold-to-delete corner
//    DomainRow           — one domain with its chips
//    DomainsSection      — the card's domain list
//    PortForwardRow      — one forward with its copy button
//    PortForwardsSection — the card's port forward list
//    StacksSection       — the card's containers by stack
//    VMCard              — one server card
//    SearchBox           — the header search field
//    EmptyState          — icon + two-line message
//    ListHeader          — title/count + switch/search/new
//    VirtualServersTable — wiring (default export)
//
//  Used by:
//    - VirtualServers.jsx — the /vm page body
// -----------------------------------------------------------

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { useNavigate, useSearchParams, useNavigationType } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import axios from "axios";
import toast from "react-hot-toast";
import {
  Button,
  Chip,
  Tooltip,
  FormControlLabel,
  IconButton,
  TextField,
  InputAdornment,
  Skeleton,
} from "@mui/material";

import { useTranslations } from "@/i18n";
import IOSSwitch from "@/components/IOSSwitch/IOSSwitch";
import { LongPressIconButton } from "@/components/LongPressButton";
import PageTitle from "@/components/PageTitle/PageTitle";
import UsageStats from "@/components/UsageStats/UsageStats";
import AddNewVM from "./AddNewVM/AddNewVM";

import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import DeleteIcon from "@mui/icons-material/Delete";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import SearchIcon from "@mui/icons-material/Search";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import ClearIcon from "@mui/icons-material/Clear";
import DomainIcon from "@mui/icons-material/Domain";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import SettingsEthernetIcon from "@mui/icons-material/SettingsEthernet";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";







// -----------------------------------------------------------
// useVirtualServers
// -----------------------------------------------------------
//
//   const { vms, isPending, refreshVms, startStop, remove } =
//     useVirtualServers(showOtherUsers)
//
// The backend side of the page: the VM list as a TanStack
// query polled every 3 seconds (sorted by id), plus the
// start/stop and delete actions. Actions fire the POST, toast
// immediately, and invalidate the list once the backend
// accepts — so the state flips as soon as possible instead of
// on the next poll.
//
// Flipping the admin-only showOtherUsers switch changes the
// query key; the previous list stays on screen as placeholder
// while the other one loads, so isPending is true only on the
// very first load and the grid never collapses back into its
// skeleton.
//
// Used by:
//   - VirtualServersTable (below); refreshVms is also handed
//     to the AddNewVM dialog so a created server shows up
//     right away
// -----------------------------------------------------------

function useVirtualServers(showOtherUsers) {

  const t = useTranslations("PAGES.vmList");
  const queryClient = useQueryClient();

  const { data: vms = [], isPending } = useQuery({
    queryKey: ['vms', showOtherUsers],
    queryFn: async () => {
      const response = await axios.get("/api/vm", {
        params: { showOtherUsers: showOtherUsers.toString() },
      });
      return response.data.sort((a, b) => a.id - b.id);
    },
    refetchInterval: 3000,
    placeholderData: keepPreviousData,
  });


  // Both showOtherUsers variants share the ['vms'] prefix, so
  // one invalidation refreshes whichever is on screen
  const refreshVms = () =>
    queryClient.invalidateQueries({ queryKey: ['vms'] });


  // Fire the action and toast right away; the list refreshes
  // as soon as the backend accepts (and keeps polling anyway)
  const startStop = (vm) => {
    const action = vm.state === "running" ? "stop" : "start";
    axios.post("/api/vm/control", { virtualServerID: vm.id, action }).then(refreshVms);
    toast.success(
      <b>{t(action === "stop" ? "TOASTS.stopping" : "TOASTS.starting", { id: vm.id })}</b>,
      { duration: 10000 }
    );
  };

  const remove = (vm) => {
    if (vm.state !== "running") {
      axios.post("/api/vm/control", { virtualServerID: vm.id, action: "delete" }).then(refreshVms);
      toast.success(<b>{t("TOASTS.deleting", { id: vm.id })}</b>, { duration: 10000 });
    } else {
      // A poll can flip the state to running MID-HOLD — never
      // swallow a completed 3-second hold in silence
      toast.error(<b>{t("CARD.stop_first")}</b>, { duration: 4000 });
    }
  };


  return { vms, isPending, refreshVms, startStop, remove };
}







// -----------------------------------------------------------
// vmMatchesQuery
// -----------------------------------------------------------
//
// The search predicate: true when the VM's name, owner email,
// id, any domain name, any forward's public port or
// description, or any stack/container name contains the query
// (case-insensitive). An empty query matches everything.
//
// Used by:
//   - VirtualServersTable (below) — filters the card grid
// -----------------------------------------------------------

function vmMatchesQuery(vm, searchQuery) {
  if (!searchQuery.trim()) return true;

  const query = searchQuery.toLowerCase();

  if (vm.name?.toLowerCase().includes(query)) return true;

  if (vm.owneremail?.toLowerCase().includes(query)) return true;

  if (vm.id?.toString().includes(query)) return true;

  if (vm.domains) {
    for (const domain of vm.domains) {
      if (domain.domainname?.toLowerCase().includes(query)) return true;
    }
  }

  if (vm.portforwards) {
    for (const forward of vm.portforwards) {
      if (forward.publicport?.toString().includes(query)) return true;
      if (forward.description?.toLowerCase().includes(query)) return true;
    }
  }

  if (vm.stacks) {
    for (const stack of vm.stacks) {
      if (stack.stackname?.toLowerCase().includes(query)) return true;
      if (stack.containers) {
        for (const container of stack.containers) {
          if (container.names?.toLowerCase().includes(query)) return true;
        }
      }
    }
  }

  return false;
}







// -----------------------------------------------------------
// QuickActions
// -----------------------------------------------------------
//
// The card's action corner: start/stop and the hold-to-delete
// button (disabled while the VM runs). Clicks stop
// propagating here so they never trigger the card's navigate.
//
// Used by:
//   - VMCard (below) — top right of the card
// -----------------------------------------------------------

function QuickActions({ vm, isRunning, onStartStop, onDelete }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <Tooltip title={isRunning ? t("CARD.stop_server") : t("CARD.start_server")}>
        <IconButton
          onClick={(e) => onStartStop(e, vm)}
          sx={{
            color: isRunning ? "red" : "green",
            backgroundColor: "lightgray",
            "&:hover": {
              backgroundColor: isRunning ? "red" : "green",
              color: "white",
            },
          }}
        >
          {isRunning ? <StopIcon /> : <PlayArrowIcon />}
        </IconButton>
      </Tooltip>
      <Tooltip title={isRunning ? t("CARD.stop_first") : t("CARD.hold_to_delete")}>
        <span>
          <LongPressIconButton
            disabled={isRunning}
            onComplete={() => onDelete(vm)}
            uncompletedToastMessage={t("CARD.hold_toast")}
            progressColor="error.main"
            progressBgColor="error.light"
            className="select-none"
            sx={{
              color: isRunning ? "grey.400" : "error.main",
              backgroundColor: "lightgray",
              "&:hover": { backgroundColor: "error.light", color: "white" },
              transition: "all 0.2s",
            }}
          >
            <DeleteIcon />
          </LongPressIconButton>
        </span>
      </Tooltip>
    </div>
  );
}







// -----------------------------------------------------------
// DomainRow
// -----------------------------------------------------------
//
// One domain of the card: the name, the open-in-new-tab
// button (http/https by the ssl flag, propagation stopped so
// the card doesn't navigate) and the Cloudflare/HTTPS chips.
//
// Used by:
//   - DomainsSection (below)
// -----------------------------------------------------------

function DomainRow({ domain }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-700 font-medium">
        {domain.domainname || "Unknown"}
      </span>
      <Tooltip title={t("CARD.open_new_tab")}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            const protocol = domain.ssl === 1 ? "https" : "http";
            window.open(`${protocol}://${domain.domainname}`, "_blank");
          }}
          sx={{
            p: 0.5,
            color: "gray",
            "&:hover": { color: "#1976d2", bgcolor: "#e3f2fd" },
          }}
        >
          <OpenInNewIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {domain.iscloudflare === 1 && (
        <Chip
          label="Cloudflare"
          size="small"
          sx={{
            fontSize: "0.6rem",
            height: 18,
            bgcolor: "green",
            color: "white",
            fontWeight: 600,
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      )}
      <Chip
        label={domain.ssl === 1 ? "HTTPS" : "No HTTPS"}
        size="small"
        sx={{
          fontSize: "0.6rem",
          height: 18,
          bgcolor: domain.ssl === 1 ? "green" : "red",
          color: "white",
          fontWeight: 600,
          "& .MuiChip-label": { px: 0.75 },
        }}
      />
    </div>
  );
}







// -----------------------------------------------------------
// DomainsSection
// -----------------------------------------------------------
//
// The card's domain list under its section heading — one
// DomainRow per domain.
//
// Used by:
//   - VMCard (below) — rendered only when domains exist
// -----------------------------------------------------------

function DomainsSection({ domains }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <div className="border-t border-gray-100 pt-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <DomainIcon sx={{ fontSize: 16, color: "gray" }} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t("CARD.domain_names")}
        </span>
      </div>
      <div className="space-y-1.5">
        {domains.map((domain, didx) => (
          <DomainRow key={didx} domain={domain} />
        ))}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// PortForwardRow
// -----------------------------------------------------------
//
// One port forward of the card: the public endpoint, the
// muted arrow to the VM-side port, the copy button
// (propagation stopped so the card doesn't navigate) and the
// description as a neutral chip.
//
// Used by:
//   - PortForwardsSection (below)
// -----------------------------------------------------------

function PortForwardRow({ forward }) {
  const t = useTranslations("PAGES.vmList");

  // The exact string students paste into their client tools
  const endpoint = `${forward.publichost}:${forward.publicport}`;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-700 font-medium">{endpoint}</span>
      <span className="text-sm text-gray-400">→ :{forward.internalport}</span>
      <Tooltip title={t("CARD.copy_endpoint")}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(endpoint);
            toast.success(<b>{t("CARD.copied")}</b>, { duration: 2000 });
          }}
          sx={{
            p: 0.5,
            color: "gray",
            "&:hover": { color: "#1976d2", bgcolor: "#e3f2fd" },
          }}
        >
          <ContentCopyIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {forward.description && (
        <Chip
          label={forward.description}
          size="small"
          sx={{
            fontSize: "0.6rem",
            height: 18,
            bgcolor: "#e5e7eb",
            color: "#374151",
            fontWeight: 600,
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      )}
    </div>
  );
}







// -----------------------------------------------------------
// PortForwardsSection
// -----------------------------------------------------------
//
// The card's port forward list under its section heading —
// one PortForwardRow per forward.
//
// Used by:
//   - VMCard (below) — rendered only when forwards exist
// -----------------------------------------------------------

function PortForwardsSection({ portforwards }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <div className="border-t border-gray-100 pt-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <SettingsEthernetIcon sx={{ fontSize: 16, color: "gray" }} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t("CARD.port_forwards")}
        </span>
      </div>
      <div className="space-y-1.5">
        {portforwards.map((forward, fidx) => (
          <PortForwardRow key={fidx} forward={forward} />
        ))}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// StacksSection
// -----------------------------------------------------------
//
// The card's docker containers grouped by stack: one labelled
// chip row per stack, chips green only while the container
// AND the VM are both running (docker status in the tooltip).
//
// Used by:
//   - VMCard (below) — bottom of the card
// -----------------------------------------------------------

function StacksSection({ stacks, vmRunning }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center gap-2 mb-2">
        <ViewInArIcon sx={{ fontSize: 16, color: "gray" }} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t("CARD.docker_containers")}
        </span>
      </div>
      {stacks && stacks.length > 0 && (
        <div className="space-y-2">
          {stacks.map((stack, sidx) => (
            <div key={sidx}>
              <span className="text-xs font-semibold text-gray-700">
                {stack.stackname || "Stack"}:
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {stack.containers?.map((container, cidx) => (
                  <Tooltip
                    key={`${container.image}-${cidx}`}
                    title={container.status || "N/A"}
                  >
                    <Chip
                      label={container.names}
                      size="small"
                      sx={{
                        fontSize: "0.65rem",
                        height: 20,
                        backgroundColor:
                          container.state === "running" && vmRunning === true
                            ? "green"
                            : "red",
                        color: "white",
                        "& .MuiChip-label": { px: 1 },
                      }}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}







// -----------------------------------------------------------
// VMCard
// -----------------------------------------------------------
//
// One server card: id + running/stopped chip, name, the
// QuickActions corner, owner and uptime line, then the
// DomainsSection, PortForwardsSection and StacksSection.
// Clicking anywhere else on the card opens the VM detail
// page.
//
// Used by:
//   - VirtualServersTable (below) — one per filtered VM
// -----------------------------------------------------------

function VMCard({ vm, onNavigate, onStartStop, onDelete }) {
  const t = useTranslations("PAGES.vmList");
  const isRunning = vm.state === "running";

  // A create in flight: the row exists, the container does
  // not yet — no navigation, no actions, amber accents
  const isCreating = vm.state === "creating";
  const accentHex = isRunning ? "#22c55e" : isCreating ? "#f59e0b" : vm.state === "unknown" ? "#9ca3af" : "#ef4444";

  return (
    <div
      onClick={() => { if (!isCreating) onNavigate(vm); }}
      className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Ambient Glow */}
      <div
        className="absolute top-0 left-0 right-0 h-24 opacity-15 pointer-events-none"
        style={{
          background: `linear-gradient(to bottom, ${accentHex} 0%, transparent 100%)`,
        }}
      />
      {/* Status Indicator Bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1 z-10"
        style={{ backgroundColor: accentHex }}
      />

      {/* Card Content */}
      <div className="p-5">
        {/* Header: VM Name + Status + Actions */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono bg-gray-300 px-2 py-0.5 rounded-full">
                #{vm.id}
              </span>
              <Chip
                label={
                  isCreating ? t("CARD.creating")
                  : vm.state === "unknown" ? t("CARD.unknown")
                  : isRunning ? t("CARD.running") : t("CARD.stopped")
                }
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  height: 22,
                  backgroundColor: isRunning ? "green" : isCreating ? "#f59e0b" : vm.state === "unknown" ? "#9ca3af" : "red",
                  color: "white",
                }}
              />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800 truncate mt-6">
              {vm.name || t("CARD.unnamed")}
            </h3>
          </div>

          {/* No actions while the build is in flight */}
          {!isCreating && (
            <QuickActions
              vm={vm}
              isRunning={isRunning}
              onStartStop={onStartStop}
              onDelete={onDelete}
            />
          )}
        </div>


        {/* Info Section */}
        <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
          {/* Owner */}
          <div className="flex items-center gap-2">
            <PersonOutlineIcon sx={{ fontSize: 18, color: "gray" }} />
            <span>{vm.owneremail || "N/A"}</span>
          </div>

          {/* Uptime */}
          <div className="flex items-center gap-2">
            <AccessTimeIcon sx={{ fontSize: 18, color: "gray" }} />
            <span>{vm.status || "N/A"}</span>
          </div>
        </div>

        {/* Resource usage — the monitor's telemetry */}
        <div className="mb-4">
          <UsageStats usage={vm.usage} />
        </div>


        {vm.domains && vm.domains.length > 0 && (
          <DomainsSection domains={vm.domains} />
        )}

        {vm.portforwards && vm.portforwards.length > 0 && (
          <PortForwardsSection portforwards={vm.portforwards} />
        )}

        <StacksSection stacks={vm.stacks} vmRunning={isRunning} />
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// SearchBox
// -----------------------------------------------------------
//
// The header search field: magnifier on the left, a clear (×)
// button while there is text, focus color from the theme —
// only the burgundy hover border stays local.
//
// Used by:
//   - ListHeader (below)
// -----------------------------------------------------------

function SearchBox({ value, onChange, onClear }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <TextField
      size="small"
      placeholder={t("HEADER.search_placeholder")}
      value={value}
      onChange={onChange}
      sx={{
        width: 280,
        "& .MuiOutlinedInput-root": {
          borderRadius: 2,
          backgroundColor: "white",
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
          },
        },
      }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: "gray" }} />
            </InputAdornment>
          ),
          endAdornment: value && (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={onClear}
                sx={{ p: 0.5 }}
              >
                <ClearIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}







// -----------------------------------------------------------
// EmptyState
// -----------------------------------------------------------
//
// The centered faded-icon message shown instead of the grid —
// both for "no servers at all" and "no search matches"; the
// caller passes the translated texts.
//
// Used by:
//   - VirtualServersTable (below) — both empty branches
// -----------------------------------------------------------

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
      <ViewInArIcon sx={{ fontSize: 128, color: "gray", opacity: 0.3 }} />
      <p className="mt-4 text-lg">{title}</p>
      <p className="text-sm">{subtitle}</p>
    </div>
  );
}







// -----------------------------------------------------------
// ListHeader
// -----------------------------------------------------------
//
// The PageTitle row of the page: title + live count on the
// left; the admin-only other-users switch, the SearchBox and
// the New Server button on the right. The new-server click
// passes its event up so the dialog can fly out of the
// button.
//
// Used by:
//   - VirtualServersTable (below)
// -----------------------------------------------------------

function ListHeader({ authdata, searchQuery, showOtherUsers, updateParam, shownCount, totalCount, onNewServer }) {
  const t = useTranslations("PAGES.vmList");

  return (
    <PageTitle>
      <div>
        <h1 className="text-2xl font-bold text-gray-800">{t("HEADER.title")}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {searchQuery
            ? t(totalCount !== 1 ? "HEADER.filtered_many" : "HEADER.filtered_one", { shown: shownCount, total: totalCount })
            : t(totalCount !== 1 ? "HEADER.count_many" : "HEADER.count_one", { n: totalCount })}
        </p>
      </div>

      <div className="flex items-center gap-4">

        {/* Show other users switch */}
        {authdata.admin === 1 && (
          <FormControlLabel
            control={
              <IOSSwitch
                checked={showOtherUsers}
                onChange={(e) => updateParam('all', e.target.checked ? '1' : '')}
                sx={{ marginRight: '10px' }}
              />
            }
            label={
              <span className="text-sm text-gray-600">{t("HEADER.show_other_users")}</span>
            }
          />
        )}

        <SearchBox
          value={searchQuery}
          onChange={(e) => updateParam('q', e.target.value)}
          onClear={() => updateParam('q', '')}
        />

        {/* New Server — contained-primary from the theme;
            the dialog flies out of this button */}
        <Button
          variant="contained"
          startIcon={<AddCircleOutlinedIcon />}
          onClick={(event) => onNewServer(event)}
          sx={{
            textTransform: "none",
            fontWeight: 600,
            borderRadius: 2,
            boxShadow: "none",
            "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
          }}
        >
          {t("HEADER.new_server")}
        </Button>
      </div>
    </PageTitle>
  );
}







// -----------------------------------------------------------
// VirtualServersTable (default export)
// -----------------------------------------------------------
//
// The wiring: URL-backed search/switch state, the scroll
// memory, the dialog state and the grid itself — everything
// with real content lives in the pieces above, the list and
// its actions in useVirtualServers. Navigation to a VM is
// client-side; the detail page's data is often already in the
// query cache, so it opens instantly.
//
// Used by:
//   - VirtualServers.jsx — the /vm page body
// -----------------------------------------------------------

export default function VirtualServersTable({ authdata }) {

  const t = useTranslations("PAGES.vmList");
  const navigate = useNavigate();

  const [openBackdrop, setOpenBackdrop] = useState(false);
  const [modalSourceRect, setModalSourceRect] = useState(null);

  // The search text and the other-users switch live in the
  // URL (?q=...&all=1) — they survive going into a VM and
  // back, and a filtered list is shareable as a link
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') ?? '';
  const showOtherUsers = searchParams.get('all') === '1';

  const updateParam = (key, value) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  };

  const { vms: data, isPending: loadingData, refreshVms, startStop, remove } = useVirtualServers(showOtherUsers);

  const filteredData = data.filter((vm) => vmMatchesQuery(vm, searchQuery));


  // Scroll memory: the list scrolls inside its own div, so the
  // browser can't bring the position back on its own. The spot
  // is saved when the page unmounts and re-applied exactly once
  // — only on back/forward (POP, not a fresh sidebar click) and
  // only once the cards are rendered, so the container is tall
  // enough to take the offset.
  const scrollRef = useRef(null);
  const restoredScrollRef = useRef(false);
  const navigationType = useNavigationType();

  useEffect(() => {
    const node = scrollRef.current;
    return () => {
      try {
        sessionStorage.setItem("vmListScroll", String(node?.scrollTop ?? 0));
      } catch { /* storage unavailable — Back just starts at the top */ }
    };
  }, []);

  useLayoutEffect(() => {
    if (restoredScrollRef.current || navigationType !== "POP" || loadingData) return;
    restoredScrollRef.current = true;
    try {
      const saved = Number(sessionStorage.getItem("vmListScroll") ?? 0);
      sessionStorage.removeItem("vmListScroll");
      if (saved > 0 && scrollRef.current) scrollRef.current.scrollTop = saved;
    } catch { /* storage unavailable — Back just starts at the top */ }
  }, [navigationType, loadingData]);


  const handleNavigate = (vm) => {
    navigate(`/vm/${vm.id}`);
  };


  // The card's click event stops propagation here (a card
  // click navigates); the action itself lives in the hook.
  // Delete needs no wrapper — the long-press button stops its
  // own events.
  const handleStartStop = (e, vm) => {
    e.stopPropagation();
    startStop(vm);
  };


  // Closing the create dialog refreshes the list, whether a
  // server was created or the dialog was just dismissed
  const handleDialogOpen = (value) => {
    setOpenBackdrop(value);
    if (value === false) {
      refreshVms();
    }
  };

  const handleNewServer = (event) => {
    setModalSourceRect(event.currentTarget.getBoundingClientRect());
    handleDialogOpen(true);
  };


  return (
    <div ref={scrollRef} className="h-[calc(100vh-105px)] w-full overflow-y-auto bg-gray-50 p-6">
      <ListHeader
        authdata={authdata}
        searchQuery={searchQuery}
        showOtherUsers={showOtherUsers}
        updateParam={updateParam}
        shownCount={filteredData.length}
        totalCount={data.length}
        onNewServer={handleNewServer}
      />

      {/* Loading State — skeleton cards in the real grid, so
          the layout doesn't jump when the list arrives */}
      {loadingData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: '12px' }} />
          ))}
        </div>
      )}

      {!loadingData && data.length === 0 && (
        <EmptyState title={t("EMPTY.none_title")} subtitle={t("EMPTY.none_subtitle")} />
      )}

      {!loadingData && data.length > 0 && filteredData.length === 0 && (
        <EmptyState title={t("EMPTY.no_match_title")} subtitle={t("EMPTY.no_match_subtitle")} />
      )}

      {/* VM Cards Grid */}
      {!loadingData && filteredData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {filteredData.map((vm) => (
            <VMCard
              key={vm.id}
              vm={vm}
              onNavigate={handleNavigate}
              onStartStop={handleStartStop}
              onDelete={remove}
            />
          ))}
        </div>
      )}

      {/* Add New VM Dialog */}
      {openBackdrop && (
        <AddNewVM setOpen={handleDialogOpen} getData={refreshVms} sourceRect={modalSourceRect} />
      )}
    </div>
  );
}
