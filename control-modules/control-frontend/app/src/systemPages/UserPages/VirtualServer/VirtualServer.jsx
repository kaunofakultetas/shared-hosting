// -----------------------------------------------------------
//  [*] Virtual Server — one server's control page
//
//  Reached from a card on /vm, inside the AppShell frame.
//  Header card with the VM icon, id/status, inline rename
//  (pencil → text field with Enter/Escape), owner + uptime
//  and the start/stop button, then the container chips and
//  two tabs: management tool cards (Controls) and the domain
//  table (Domain Names) — the open tab lives in the URL
//  (?tab=domains). The data lives in useVirtualServer
//  (5-second poll; 401 bounces to "/"); until it arrives the
//  page renders as a skeleton.
//
//  The tool cards open the per-VM admin services (Dockge,
//  File Browser, SSH terminal) on port 8443 — a
//  virtual-server-id cookie is set first so the endpoint
//  Caddy can route the tab to the right VM's containers. The
//  VS Code card just opens a docs page.
//
//  Split into (root component last):
//
//    useVirtualServer  — VM query + start/stop + rename
//    ControlCard       — one management tool card
//    ContainerChip     — one docker container chip
//    ContainerStacks   — the containers grouped by stack
//    VmNameEditor      — name with the inline rename flow
//    VmHeaderCard      — icon/status/name/actions card
//    ControlsTab       — the four management tool cards
//    DetailSkeleton    — the page as grey bones
//    VirtualServerPage — tabs + wiring (default export)
//
//  Used by:
//    - router.jsx — route /vm/:virtualServerID (via
//      PageWrapper, which passes virtualServerID)
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import {
  Button,
  Tabs,
  Tab,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  Skeleton,
} from "@mui/material";
import toast from "react-hot-toast";

import { useTranslations } from "@/i18n";
import DomainsListTable from "./DomainsListTable/DomainsListTable";

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import TerminalIcon from "@mui/icons-material/Terminal";
import CodeIcon from "@mui/icons-material/Code";
import FolderIcon from "@mui/icons-material/Folder";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import DnsIcon from "@mui/icons-material/Dns";
import SettingsIcon from "@mui/icons-material/Settings";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";







// -----------------------------------------------------------
// useVirtualServer
// -----------------------------------------------------------
//
//   const { vmData, startStop, rename } =
//     useVirtualServer(virtualServerID)
//
// The backend side of the page: the VM record as a TanStack
// query polled every 5 seconds, plus the start/stop and
// rename actions. Every action invalidates the query on
// completion, so the page updates immediately instead of on
// the next poll; action results land in toasts.
//
// vmData is null until the first answer (the page shows its
// skeleton) — a 404 (unknown id, or a VM the monitor has
// not seen yet) keeps it null and the poll keeps retrying. rename(newName) resolves true on
// success so the caller knows when to leave edit mode. A 401
// means the session ended or the VM belongs to someone else —
// the whole page bounces to "/", like the old server-side
// check did.
//
// Used by:
//   - VirtualServerPage (below)
// -----------------------------------------------------------

function useVirtualServer(virtualServerID) {

  const t = useTranslations("PAGES.vmDetail");
  const queryClient = useQueryClient();

  const { data: vmData = null, error } = useQuery({
    queryKey: ['vm', virtualServerID],
    queryFn: async () => (await axios.get(`/api/vm/${virtualServerID}`)).data,
    refetchInterval: 5000,
    retry: false,
  });


  // No access (expired session / foreign VM) — restart at "/"
  useEffect(() => {
    if (error?.response?.status === 401) {
      window.location.href = "/";
    }
  }, [error]);


  const refreshVm = () =>
    queryClient.invalidateQueries({ queryKey: ['vm', virtualServerID] });


  const startStop = async () => {
    const action = vmData.state === "running" ? "stop" : "start";
    try {
      await axios.post("/api/vm/control", { virtualServerID: vmData.id, action });
      toast.success(
        <b>{t(action === "stop" ? "TOASTS.stopping" : "TOASTS.starting")}</b>,
        { duration: 5000 }
      );
      refreshVm();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t("TOASTS.operation_failed");
      toast.error(<b>{errorMessage}</b>);
    }
  };


  // Resolves true on success so the page can close the edit
  // field only when the rename actually happened
  const rename = async (newName) => {
    try {
      await axios.post("/api/vm/control", {
        virtualServerID: vmData.id,
        action: "rename",
        newName,
      });
      toast.success(<b>{t("TOASTS.renamed")}</b>);
      refreshVm();
      return true;
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t("TOASTS.rename_failed");
      toast.error(<b>{errorMessage}</b>);
      return false;
    }
  };


  return { vmData, startStop, rename };
}







// -----------------------------------------------------------
// ControlCard
// -----------------------------------------------------------
//
// One management tool card on the Controls tab: tinted icon
// (the color prop with 15% alpha as its backdrop), title and
// description, whole card clickable.
//
// Used by:
//   - VirtualServerPage (below) — Dockge / File Browser /
//     SSH / VS Code cards
// -----------------------------------------------------------

function ControlCard({ icon: Icon, title, description, onClick, color = "#1976d2" }) {
  return (
    <div
      onClick={onClick}
      className="group bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all duration-300"
    >
      <div className="flex items-start gap-4">
        <div
          className="p-3 rounded-xl transition-colors duration-300"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon sx={{ fontSize: 28, color: color }} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// ContainerChip
// -----------------------------------------------------------
//
// One docker container as a green/red chip — green only while
// the container AND the VM are both running; the docker
// status text lives in the tooltip.
//
// Used by:
//   - VirtualServerPage (below) — the containers section
// -----------------------------------------------------------

function ContainerChip({ container, vmRunning }) {
  const isRunning = container.state === "running" && vmRunning;
  return (
    <Tooltip title={container.status || "N/A"}>
      <Chip
        label={container.names}
        size="small"
        sx={{
          fontSize: "0.65rem",
          height: 20,
          backgroundColor: isRunning ? "green" : "red",
          color: "white",
          "& .MuiChip-label": { px: 1 },
        }}
      />
    </Tooltip>
  );
}







// -----------------------------------------------------------
// ContainerStacks
// -----------------------------------------------------------
//
// The docker containers of the VM, grouped by stack — one
// labelled chip row per stack under the section heading.
//
// Used by:
//   - VmHeaderCard (below) — bottom of the header card
// -----------------------------------------------------------

function ContainerStacks({ stacks, vmRunning }) {
  const t = useTranslations("PAGES.vmDetail");

  return (
    <div className="mt-6 pt-5 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-3">
        <ViewInArIcon sx={{ fontSize: 18, color: "gray" }} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t("HEADER.docker_containers")}
        </span>
      </div>
      <div className="space-y-3">
        {stacks.map((stack, sidx) => (
          <div key={sidx}>
            <span className="text-xs font-semibold text-gray-600 mb-1 block">
              {stack.stackname || "Stack"}
            </span>
            <div className="flex flex-wrap gap-2">
              {stack.containers?.map((container, cidx) => (
                <ContainerChip key={cidx} container={container} vmRunning={vmRunning} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// VmNameEditor
// -----------------------------------------------------------
//
// The VM name with the whole inline rename flow: normally the
// bold name plus the pencil; the pencil swaps in a text field
// (Enter saves, Escape cancels) with save/cancel buttons. The
// editing state lives here — the page only supplies the name
// and the rename action, and the field closes only when the
// rename actually succeeded.
//
// Used by:
//   - VmHeaderCard (below)
// -----------------------------------------------------------

function VmNameEditor({ name, rename }) {
  const t = useTranslations("PAGES.vmDetail");

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState("");


  const startEditing = () => {
    setEditedName(name || "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedName("");
  };

  const saveName = async () => {
    if (!editedName.trim()) {
      toast.error(<b>{t("TOASTS.name_empty")}</b>);
      return;
    }
    if (await rename(editedName.trim())) {
      setIsEditing(false);
    }
  };


  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mb-3">
        <TextField
          value={editedName}
          onChange={(e) => setEditedName(e.target.value)}
          size="small"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") cancelEditing();
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              fontSize: "1.5rem",
              fontWeight: 700,
            },
          }}
        />
        <Tooltip title={t("HEADER.save")}>
          <IconButton
            onClick={saveName}
            sx={{
              color: "green",
              bgcolor: "#dcfce7",
              "&:hover": { bgcolor: "#bbf7d0" },
            }}
          >
            <CheckIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("HEADER.cancel")}>
          <IconButton
            onClick={cancelEditing}
            sx={{
              color: "red",
              bgcolor: "#fee2e2",
              "&:hover": { bgcolor: "#fecaca" },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 mb-3 mt-5">
      <h1 className="text-2xl font-bold text-gray-800">
        {name || t("HEADER.unnamed")}
      </h1>
      <Tooltip title={t("HEADER.rename")}>
        <IconButton
          onClick={startEditing}
          size="small"
          sx={{
            color: "gray",
            p: 0.5,
            mt: "-6px",
            "&:hover": { color: "primary.main", bgcolor: "#f3f4f6" },
          }}
        >
          <EditIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Tooltip>
    </div>
  );
}







// -----------------------------------------------------------
// VmHeaderCard
// -----------------------------------------------------------
//
// The big white card at the top of the page: green/red glow
// and status bar by VM state, the VM icon, id + status chip,
// the name (with the inline rename), owner + uptime, the
// start/stop button on the right and the container chips
// underneath.
//
// Used by:
//   - VirtualServerPage (below)
// -----------------------------------------------------------

function VmHeaderCard({ vmData, virtualServerID, startStop, rename }) {
  const t = useTranslations("PAGES.vmDetail");
  const isRunning = vmData.state === "running";

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden relative">
      {/* Ambient Glow */}
      <div
        className="absolute top-0 left-0 right-0 h-32 opacity-20 pointer-events-none"
        style={{
          background: isRunning
            ? "linear-gradient(to bottom, #22c55e 0%, transparent 100%)"
            : "linear-gradient(to bottom, #ef4444 0%, transparent 100%)",
        }}
      />
      {/* Status Bar */}
      <div className={`h-1.5 ${isRunning ? "bg-green-500" : "bg-red-500"} relative z-10`} />

      <div className="p-6">
        <div className="flex items-start justify-between">
          {/* Left: VM Info */}
          <div className="flex items-start gap-5">
            {/* VM Icon */}
            <div className="w-32 h-32 bg-gray-200 rounded-xl flex items-center justify-center p-3">
              <img
                src="/img/virtual-machine-icon.png"
                alt="Virtual Server"
                className="w-full h-full object-contain"
              />
            </div>

            {/* VM Details */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-md font-mono bg-gray-300 px-2 py-0.5 rounded-full">
                  #{virtualServerID}
                </span>
                <Chip
                  label={isRunning ? t("HEADER.running") : t("HEADER.stopped")}
                  size="small"
                  sx={{
                    fontWeight: 600,
                    fontSize: "1rem",
                    height: 28,
                    backgroundColor: isRunning ? "green" : "red",
                    color: "white",
                  }}
                />
              </div>

              <VmNameEditor name={vmData.name} rename={rename} />

              <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <PersonOutlineIcon sx={{ fontSize: 18, color: "gray" }} />
                  <span>{vmData.owneremail || "N/A"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <AccessTimeIcon sx={{ fontSize: 18, color: "gray" }} />
                  <span>{vmData.status || "N/A"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="contained"
              onClick={startStop}
              startIcon={isRunning ? <StopIcon /> : <PlayArrowIcon />}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                bgcolor: isRunning ? "red" : "green",
                "&:hover": {
                  bgcolor: isRunning ? "#dc2626" : "#16a34a",
                },
              }}
            >
              {isRunning ? t("HEADER.stop_server") : t("HEADER.start_server")}
            </Button>
          </div>
        </div>

        {vmData.stacks && vmData.stacks.length > 0 && (
          <ContainerStacks stacks={vmData.stacks} vmRunning={isRunning} />
        )}
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// ControlsTab
// -----------------------------------------------------------
//
// The Controls tab body: the intro line and the four
// management tool cards. The per-VM tools live behind port
// 8443 — a virtual-server-id cookie is set first so the
// endpoint Caddy routes the new tab to the right VM's
// containers; the VS Code card just opens a docs page.
//
// Used by:
//   - VirtualServerPage (below) — the first tab
// -----------------------------------------------------------

function ControlsTab({ vmId }) {
  const t = useTranslations("PAGES.vmDetail");


  const openTool = (path) => {
    document.cookie = `virtual-server-id=${vmId}; path=/;`;
    const url = `${window.location.protocol}//${window.location.hostname}:8443${path}`;
    window.open(url, "_blank");
  };

  const openSystemPage = (path) => {
    window.open(path, "_blank");
  };


  return (
    <div>
      <p className="text-gray-600 mb-6">
        {t("CONTROLS.intro")}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
        <ControlCard
          icon={ViewInArIcon}
          title="Dockge"
          description={t("CONTROLS.dockge_desc")}
          onClick={() => openTool("/")}
          color="#2563eb"
        />
        <ControlCard
          icon={FolderIcon}
          title={t("CONTROLS.filebrowser")}
          description={t("CONTROLS.filebrowser_desc")}
          onClick={() => openTool("/filebrowser")}
          color="#16a34a"
        />
        <ControlCard
          icon={TerminalIcon}
          title={t("CONTROLS.ssh")}
          description={t("CONTROLS.ssh_desc")}
          onClick={() => openTool("/ssh/host/172.18.0.1")}
          color="#9333ea"
        />
        <ControlCard
          icon={CodeIcon}
          title="Visual Studio Code"
          description={t("CONTROLS.vscode_desc")}
          onClick={() => openSystemPage("/docs/books/visual-studio-code/page/connect-vscode-with-your-server")}
          color="#2563eb"
        />
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// DetailSkeleton
// -----------------------------------------------------------
//
// The page as grey bones — back button, the header card with
// the icon square and text lines, and the tabs card — shown
// until the VM record arrives.
//
// Used by:
//   - VirtualServerPage (below)
// -----------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="flex-1 p-4 overflow-y-auto h-[calc(100vh-105px)] bg-gray-100">
      <Skeleton variant="rounded" width={220} height={36} sx={{ mb: 2 }} />

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-6">
        <div className="flex items-start gap-5">
          <Skeleton variant="rounded" width={128} height={128} />
          <div className="flex-1">
            <Skeleton variant="text" width={180} height={28} />
            <Skeleton variant="text" width={280} height={40} />
            <Skeleton variant="text" width={320} height={24} />
          </div>
          <Skeleton variant="rounded" width={130} height={36} />
        </div>
      </div>

      {/* Tabs card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <Skeleton variant="text" width={260} height={32} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Skeleton variant="rounded" height={90} />
          <Skeleton variant="rounded" height={90} />
          <Skeleton variant="rounded" height={90} />
          <Skeleton variant="rounded" height={90} />
        </div>
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// VirtualServerPage (default export)
// -----------------------------------------------------------
//
// The page frame: back button, the header card and the two
// tabs — everything with real content lives in the pieces
// above; the data and actions come from useVirtualServer.
//
// Used by:
//   - router.jsx — route /vm/:virtualServerID (via
//     PageWrapper)
// -----------------------------------------------------------

export default function VirtualServerPage({ virtualServerID }) {

  const t = useTranslations("PAGES.vmDetail");
  const navigate = useNavigate();

  const { vmData, startStop, rename } = useVirtualServer(virtualServerID);

  // The open tab lives in the URL (?tab=domains) — it
  // survives leaving the page and the link is shareable
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') === 'domains' ? 1 : 0;
  const setCurrentTab = (val) =>
    setSearchParams(val === 1 ? { tab: 'domains' } : {}, { replace: true });


  // Nothing to show yet (or the id answered empty)
  if (!vmData) {
    return <DetailSkeleton />;
  }


  return (
    <div className="flex-1 p-4 overflow-y-auto h-[calc(100vh-105px)] bg-gray-100">
      {/* Back Button — contained-primary from the theme. Real
          history back when there is an in-app entry to return
          to (keeps the list's ?q=&all= filters and scroll spot);
          a deep link straight into a VM falls back to /vm */}
      <Button
        variant="contained"
        onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/vm"))}
        startIcon={<ArrowBackIcon />}
        sx={{
          mb: 2,
          textTransform: "none",
          borderRadius: 2,
        }}
      >
        {t("HEADER.back")}
      </Button>

      <VmHeaderCard
        vmData={vmData}
        virtualServerID={virtualServerID}
        startStop={startStop}
        rename={rename}
      />

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="border-b border-gray-200">
          <Tabs
            value={currentTab}
            onChange={(e, val) => setCurrentTab(val)}
            sx={{
              px: 2,
              "& .MuiTab-root": {
                textTransform: "none",
                fontWeight: 600,
                fontSize: "0.9rem",
                color: "#6b7280",
                "&.Mui-selected": {
                  color: "primary.main",
                },
              },
              "& .MuiTabs-indicator": {
                backgroundColor: "primary.main",
                height: 3,
                borderRadius: "3px 3px 0 0",
              },
            }}
          >
            <Tab icon={<SettingsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label={t("TABS.controls")} />
            <Tab icon={<DnsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label={t("TABS.domains")} />
          </Tabs>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {currentTab === 0 && (
            <ControlsTab vmId={vmData.id} />
          )}

          {currentTab === 1 && (
            <DomainsListTable virtualServerID={virtualServerID} />
          )}
        </div>
      </div>
    </div>
  );
}
