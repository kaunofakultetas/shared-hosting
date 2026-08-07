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
//  Search matches VM name, owner email, VM id, domain names
//  and container/stack names. Delete additionally requires
//  the VM to be stopped and a 3-second hold on the shared
//  LongPressIconButton.
//
//  Split into (root component last):
//
//    useVirtualServers   — list query + start/stop/delete
//    VMCard              — one server card
//    VirtualServersTable — layout + search (default export)
//
//  Used by:
//    - VirtualServers.jsx — the /vm page body
// -----------------------------------------------------------

import { useState } from "react";
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

import IOSSwitch from "@/components/Other/IOSSwitch/IOSSwitch";
import { LongPressIconButton } from "@/components/LongPressButton";
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
      <b>
        {action === "stop" ? "Stopping" : "Starting"} server: #{vm.id}
      </b>,
      { duration: 10000 }
    );
  };

  const remove = (vm) => {
    if (vm.state !== "running") {
      axios.post("/api/vm/control", { virtualServerID: vm.id, action: "delete" }).then(refreshVms);
      toast.success(<b>Deleting server: #{vm.id}</b>, { duration: 10000 });
    }
  };


  return { vms, isPending, refreshVms, startStop, remove };
}




// -----------------------------------------------------------
// VMCard
// -----------------------------------------------------------
//
// One server card: id + running/stopped chip, name, start/
// stop and hold-to-delete actions, owner and uptime line,
// then the domain list (with open-in-new-tab, Cloudflare and
// HTTPS chips) and the docker containers grouped by stack.
// Clicking anywhere else on the card opens the VM detail
// page; the action corner stops that propagation.
//
// Used by:
//   - VirtualServersTable (below) — one per filtered VM
// -----------------------------------------------------------

function VMCard({ vm, onNavigate, onStartStop, onDelete }) {
  const isRunning = vm.state === "running";

  return (
    <div
      onClick={() => onNavigate(vm)}
      className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Ambient Glow */}
      <div
        className="absolute top-0 left-0 right-0 h-24 opacity-15 pointer-events-none"
        style={{
          background: isRunning
            ? "linear-gradient(to bottom, #22c55e 0%, transparent 100%)"
            : "linear-gradient(to bottom, #ef4444 0%, transparent 100%)",
        }}
      />
      {/* Status Indicator Bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isRunning ? "bg-green-500" : "bg-red-500"
        } z-10`}
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
                label={isRunning ? "Running" : "Stopped"}
                size="small"
                sx={{
                  fontWeight: 600,
                  fontSize: "0.7rem",
                  height: 22,
                  backgroundColor: isRunning ? "green" : "red",
                  color: "white",
                }}
              />
            </div>
            <h3 className="text-2xl font-semibold text-gray-800 truncate mt-6">
              {vm.name || "Unnamed Server"}
            </h3>
          </div>

          {/* Quick Actions */}
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Tooltip title={isRunning ? "Stop Server" : "Start Server"}>
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
            <Tooltip title={isRunning ? "Stop server first" : "Hold to delete"}>
              <span>
                <LongPressIconButton
                  disabled={isRunning}
                  onComplete={() => onDelete(vm)}
                  uncompletedToastMessage="Hold for 3 seconds to delete"
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


        {/* Domains */}
        {vm.domains && vm.domains.length > 0 && (
          <div className="border-t border-gray-100 pt-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <DomainIcon sx={{ fontSize: 16, color: "gray" }} />
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Domain Names
              </span>
            </div>
            <div className="space-y-1.5">
              {vm.domains.map((domain, didx) => (
                <div key={didx} className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-700 font-medium">
                    {domain.domainname || "Unknown"}
                  </span>
                  <Tooltip title="Open in new tab">
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
              ))}
            </div>
          </div>
        )}


        {/* Docker Containers */}
        <div className="border-t border-gray-100 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <ViewInArIcon sx={{ fontSize: 16, color: "gray" }} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Docker Containers
            </span>
          </div>
          {vm.stacks && vm.stacks.length > 0 && (
            <div className="space-y-2">
              {vm.stacks.map((stack, sidx) => (
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
                              container.state === "running" && isRunning === true
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
      </div>
    </div>
  );
}




// -----------------------------------------------------------
// VirtualServersTable (default export)
// -----------------------------------------------------------
//
// Layout, search and the dialog state; the list itself and
// the start-stop/delete actions come from useVirtualServers.
// Navigation to a VM is a hard page load, matching the old
// app.
//
// Used by:
//   - VirtualServers.jsx — the /vm page body
// -----------------------------------------------------------

export default function VirtualServersTable({ authdata }) {

  const [openBackdrop, setOpenBackdrop] = useState(false);
  const [showOtherUsers, setShowOtherUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { vms: data, isPending: loadingData, refreshVms, startStop, remove } = useVirtualServers(showOtherUsers);


  // Filter VMs based on search query — matches name, owner,
  // id, domain names, stack and container names
  const filteredData = data.filter((vm) => {
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
  });


  const handleNavigate = (vm) => {
    window.location.href = `/vm/${vm.id}`;
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


  return (
    <div className="h-[calc(100vh-105px)] w-full overflow-y-auto bg-gray-50 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Virtual Servers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {searchQuery ? (
              <>{filteredData.length} of {data.length} server{data.length !== 1 ? "s" : ""}</>
            ) : (
              <>{data.length} server{data.length !== 1 ? "s" : ""} total</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-4">

          {/* Show other users switch */}
          {authdata.admin === 1 && (
            <FormControlLabel
              control={
                <IOSSwitch
                  checked={showOtherUsers}
                  onChange={(e) => setShowOtherUsers(e.target.checked)}
                  sx={{ marginRight: '10px' }}
                />
              }
              label={
                <span className="text-sm text-gray-600">Show other users</span>
              }
            />
          )}


          {/* Search Box — focus color comes from the theme;
              only the burgundy hover border stays local */}
          <TextField
            size="small"
            placeholder="Search VMs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: "gray" }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setSearchQuery("")}
                    sx={{ p: 0.5 }}
                  >
                    <ClearIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />


          {/* New Server — contained-primary from the theme */}
          <Button
            variant="contained"
            startIcon={<AddCircleOutlinedIcon />}
            onClick={() => handleDialogOpen(true)}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: "none",
              "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.15)" },
            }}
          >
            New Server
          </Button>
        </div>
      </div>

      {/* Loading State — skeleton cards in the real grid, so
          the layout doesn't jump when the list arrives */}
      {loadingData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: '12px' }} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loadingData && data.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <ViewInArIcon sx={{ fontSize: 128, color: "gray", opacity: 0.3 }} />
          <p className="mt-4 text-lg">No virtual servers found</p>
          <p className="text-sm">Create your first server to get started</p>
        </div>
      )}

      {/* No Search Results */}
      {!loadingData && data.length > 0 && filteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <ViewInArIcon sx={{ fontSize: 128, color: "gray", opacity: 0.3 }} />
          <p className="mt-4 text-lg">No matches found</p>
          <p className="text-sm">Try a different search term</p>
        </div>
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
        <AddNewVM setOpen={handleDialogOpen} getData={refreshVms} />
      )}
    </div>
  );
}
