"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Button,
  Chip,
  Tooltip,
  FormControlLabel,
  CircularProgress,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import IOSSwitch from "@/components/Other/IOSSwitch/IOSSwitch";
import { useTheme } from "@mui/material/styles";
import axios from "axios";

import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import DeleteIcon from "@mui/icons-material/Delete";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import StorageIcon from "@mui/icons-material/Storage";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import DomainIcon from "@mui/icons-material/Domain";

import AddNewVM from "./AddNewVM/AddNewVM";
import toast from "react-hot-toast";

const LONG_PRESS_DURATION = 3000;




// Long Press Delete Button Component
const LongPressDeleteButton = ({ row, onDelete, disabled }) => {
  const [progress, setProgress] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const isPressedRef = useRef(false);
  const eventRef = useRef(null);

  const animate = useCallback(() => {
    if (!isPressedRef.current || !startTimeRef.current) return;

    const elapsed = Date.now() - startTimeRef.current;
    const newProgress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
    setProgress(newProgress);

    if (elapsed >= LONG_PRESS_DURATION) {
      setIsPressed(false);
      isPressedRef.current = false;
      setProgress(0);
      onDelete(eventRef.current, row);
      return;
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [onDelete, row]);

  const startLongPress = useCallback(
    (e) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();

      eventRef.current = e;
      startTimeRef.current = Date.now();
      isPressedRef.current = true;
      setIsPressed(true);
      setProgress(0);
      animationRef.current = requestAnimationFrame(animate);
    },
    [disabled, animate]
  );

  const cancelLongPress = useCallback((e) => {
    if (!isPressedRef.current) return;
    e.stopPropagation();

    const elapsed = startTimeRef.current
      ? Date.now() - startTimeRef.current
      : 0;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (elapsed > 0 && elapsed < LONG_PRESS_DURATION) {
      toast.error(<b>Hold for 3 seconds to delete</b>, { duration: 3000 });
    }

    isPressedRef.current = false;
    setIsPressed(false);
    setProgress(0);
    startTimeRef.current = null;
  }, []);

  useEffect(() => {
    return () =>
      animationRef.current && cancelAnimationFrame(animationRef.current);
  }, []);

  return (
    <IconButton
      disabled={disabled}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onContextMenu={(e) => e.preventDefault()}
      className="select-none"
      sx={{
        color: disabled ? "grey.400" : "error.main",
        backgroundColor: "lightgray",
        "&:hover": { backgroundColor: "error.light", color: "white" },
        transition: "all 0.2s",
      }}
    >
      {isPressed ? (
        <div className="relative flex items-center justify-center w-6 h-6">
          <CircularProgress
            variant="determinate"
            value={100}
            size={24}
            thickness={4}
            sx={{ color: "error.light", position: "absolute" }}
          />
          <CircularProgress
            variant="determinate"
            value={progress}
            size={24}
            thickness={4}
            sx={{
              color: "error.main",
              position: "absolute",
              transform: "rotate(-90deg)",
              "& .MuiCircularProgress-circle": {
                strokeLinecap: "round",
                transition: "none",
              },
            }}
          />
        </div>
      ) : (
        <DeleteIcon />
      )}
    </IconButton>
  );
};




// VM Card Component
const VMCard = ({ vm, onNavigate, onStartStop, onDelete }) => {
  const isRunning = vm.state === "running";

  return (
    <div
      onClick={() => onNavigate(vm)}
      className="group relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-300 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      {/* Status Indicator Bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${
          isRunning ? "bg-green-500" : "bg-red-500"
        }`}
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
            <h3 className="text-lg font-semibold text-gray-800 truncate">
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
                <LongPressDeleteButton
                  row={vm}
                  onDelete={onDelete}
                  disabled={isRunning}
                />
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
            <StorageIcon sx={{ fontSize: 16, color: "gray" }} />
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Containers
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
};




// Main Component
const VirtualServersTable = ({ authdata }) => {
  const theme = useTheme();

  const [loadingData, setLoadingData] = useState(true);
  const [data, setData] = useState([]);
  const [openBackdrop, setOpenBackdrop] = useState(false);
  const [showOtherUsers, setShowOtherUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter VMs based on search query
  const filteredData = data.filter((vm) => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    
    // Search by VM name
    if (vm.name?.toLowerCase().includes(query)) return true;
    
    // Search by owner email
    if (vm.owneremail?.toLowerCase().includes(query)) return true;
    
    // Search by VM ID
    if (vm.id?.toString().includes(query)) return true;
    
    // Search by domain names
    if (vm.domains) {
      for (const domain of vm.domains) {
        if (domain.domainname?.toLowerCase().includes(query)) return true;
      }
    }
    
    // Search by container names
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

  const fetchData = async () => {
    try {
      const response = await axios.get("/api/vm", {
        params: { showOtherUsers: showOtherUsers.toString() },
      });
      const sortedData = response.data.sort((a, b) => a.id - b.id);
      setData(sortedData);
      setLoadingData(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    const intervalId = setInterval(fetchData, 3000);
    return () => clearInterval(intervalId);
  }, [openBackdrop, showOtherUsers]);

  const handleNavigate = (vm) => {
    window.location.href = `/vm/${vm.id}`;
  };

  const handleStartStop = (e, vm) => {
    e.stopPropagation();
    const action = vm.state === "running" ? "stop" : "start";
    axios.post("/api/vm/control", { virtualServerID: vm.id, action });
    toast.success(
      <b>
        {action === "stop" ? "Stopping" : "Starting"} server: #{vm.id}
      </b>,
      { duration: 10000 }
    );
  };

  const handleDelete = (e, vm) => {
    e.stopPropagation();
    if (vm.state !== "running") {
      axios.post("/api/vm/control", { virtualServerID: vm.id, action: "delete" });
      toast.success(<b>Deleting server: #{vm.id}</b>, { duration: 10000 });
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


          {/* Search Box */}
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
                  borderColor: "rgb(123, 0, 63)",
                },
                "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                  borderColor: "rgb(123, 0, 63)",
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


          <Button
            variant="contained"
            startIcon={<AddCircleOutlinedIcon />}
            onClick={() => setOpenBackdrop(true)}
            sx={{
              textTransform: "none",
              fontWeight: 600,
              borderRadius: 2,
              boxShadow: "none",
              backgroundColor: "rgb(123, 0, 63)",
              "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.15)", backgroundColor: "#E64164" },
            }}
          >
            New Server
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loadingData && (
        <div className="flex items-center justify-center h-64">
          <CircularProgress />
        </div>
      )}

      {/* Empty State */}
      {!loadingData && data.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <StorageIcon sx={{ fontSize: 64, color: "gray", opacity: 0.3 }} />
          <p className="mt-4 text-lg">No virtual servers found</p>
          <p className="text-sm">Create your first server to get started</p>
        </div>
      )}

      {/* No Search Results */}
      {!loadingData && data.length > 0 && filteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <SearchIcon sx={{ fontSize: 64, color: "gray", opacity: 0.3 }} />
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
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add New VM Dialog */}
      {openBackdrop && (
        <AddNewVM setOpen={setOpenBackdrop} getData={fetchData} />
      )}
    </div>
  );
};

export default VirtualServersTable;
