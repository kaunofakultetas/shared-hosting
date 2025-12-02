"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import {
  Box,
  Button,
  Tabs,
  Tab,
  Chip,
  CircularProgress,
  IconButton,
  Tooltip,
  TextField,
} from "@mui/material";

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
import RefreshIcon from "@mui/icons-material/Refresh";
import EditIcon from "@mui/icons-material/Edit";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import DomainsListTable from "./DomainsListTable/DomainsListTable";
import toast, { Toaster } from "react-hot-toast";
import axios from "axios";

// Control Card Component
const ControlCard = ({ icon: Icon, title, description, onClick, color = "#1976d2" }) => (
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

// Container Chip Component
const ContainerChip = ({ container, vmRunning }) => {
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
};

const VirtualServerPage = ({ virtualServerID, authdata }) => {
  const [vmData, setVmData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  const fetchData = async () => {
    try {
      const response = await fetch(`/api/vm/${virtualServerID}`);
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      const data = await response.json();
      setVmData(data[0]);
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error("Error fetching VM data:", error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [virtualServerID]);



  const handleStartStop = async () => {
    const action = vmData.state === "running" ? "stop" : "start";
    try {
      await axios.post("/api/vm/control", { virtualServerID: vmData.id, action });
      toast.success(
        <b>{action === "stop" ? "Stopping" : "Starting"} server...</b>,
        { duration: 5000 }
      );
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || "Operation failed";
      toast.error(<b>{errorMessage}</b>);
    }
  };



  const handleStartEditing = () => {
    setEditedName(vmData.name || "");
    setIsEditingName(true);
  };


  
  const handleCancelEditing = () => {
    setIsEditingName(false);
    setEditedName("");
  };



  const handleSaveName = async () => {
    if (!editedName.trim()) {
      toast.error(<b>Name cannot be empty</b>);
      return;
    }
    try {
      await axios.post("/api/vm/control", {
        virtualServerID: vmData.id,
        action: "rename",
        newName: editedName.trim(),
      });
      toast.success(<b>Server renamed successfully</b>);
      setIsEditingName(false);
      fetchData();
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || "Failed to rename server";
      toast.error(<b>{errorMessage}</b>);
    }
  };



  const openTool = (path) => {
    document.cookie = `virtual-server-id=${vmData.id}; path=/;`;
    const url = `${window.location.protocol}//${window.location.hostname}:8443${path}`;
    window.open(url, "_blank");
  };


  const openSystemPage = (path) => {
    window.open(path, "_blank");
  };



  const isRunning = vmData?.state === "running";

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex">
          <Sidebar authdata={authdata} />
          <div className="flex-1 flex items-center justify-center h-[calc(100vh-105px)]">
            <div className="text-center">
              <CircularProgress sx={{ color: "rgb(123, 0, 63)" }} />
              <p className="mt-4 text-gray-500">Loading virtual server...</p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Toaster position="top-center" />
      <Navbar />
      <div className="flex">
        <Sidebar authdata={authdata} />

        <div className="flex-1 p-4 overflow-y-auto h-[calc(100vh-105px)]">
          {/* Back Button */}
          <Button
            variant="contained"
            onClick={() => (window.location.href = "/vm")}
            startIcon={<ArrowBackIcon />}
            sx={{
              mb: 2,
              textTransform: "none",
              color: "white",
              backgroundColor: "#78003F",
              borderRadius: 2,
              "&:hover": {
                backgroundColor: "#E64164",
              },
            }}
          >
            Back to Virtual Servers
          </Button>

          {/* Header Card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
            {/* Status Bar */}
            <div className={`h-1.5 ${isRunning ? "bg-green-500" : "bg-red-500"}`} />

            <div className="p-6">
              <div className="flex items-start justify-between">
                {/* Left: VM Info */}
                <div className="flex items-start gap-5">
                  {/* VM Icon */}
                  <div className="w-24 h-24 bg-gray-200 rounded-xl flex items-center justify-center p-3">
                    <img 
                      src="/img/virtual-machine-icon.png" 
                      alt="Virtual Server" 
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* VM Details */}
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-xs font-mono bg-gray-300 px-2 py-0.5 rounded-full">
                        #{virtualServerID}
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
                    {isEditingName ? (
                      <div className="flex items-center gap-2 mb-3">
                        <TextField
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          size="small"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveName();
                            if (e.key === "Escape") handleCancelEditing();
                          }}
                          sx={{
                            "& .MuiOutlinedInput-root": {
                              fontSize: "1.5rem",
                              fontWeight: 700,
                            },
                          }}
                        />
                        <Tooltip title="Save">
                          <IconButton
                            onClick={handleSaveName}
                            sx={{
                              color: "green",
                              bgcolor: "#dcfce7",
                              "&:hover": { bgcolor: "#bbf7d0" },
                            }}
                          >
                            <CheckIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Cancel">
                          <IconButton
                            onClick={handleCancelEditing}
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
                    ) : (
                      <div className="flex items-center gap-2 mb-3 mt-5">
                        <h1 className="text-2xl font-bold text-gray-800">
                          {vmData.name || "Unnamed Server"}
                        </h1>
                        <Tooltip title="Rename server">
                          <IconButton
                            onClick={handleStartEditing}
                            size="small"
                            sx={{
                              color: "gray",
                              p: 0.5,
                              mt: "-6px",
                              "&:hover": { color: "#78003F", bgcolor: "#f3f4f6" },
                            }}
                          >
                            <EditIcon sx={{ fontSize: 20 }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    )}

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
                    onClick={handleStartStop}
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
                    {isRunning ? "Stop Server" : "Start Server"}
                  </Button>
                </div>
              </div>

              {/* Containers Section */}
              {vmData.stacks && vmData.stacks.length > 0 && (
                <div className="mt-6 pt-5 border-t border-gray-100">
                  <div className="flex items-center gap-2 mb-3">
                    <ViewInArIcon sx={{ fontSize: 18, color: "gray" }} />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Docker Containers
                    </span>
                  </div>
                  <div className="space-y-3">
                    {vmData.stacks.map((stack, sidx) => (
                      <div key={sidx}>
                        <span className="text-xs font-semibold text-gray-600 mb-1 block">
                          {stack.stackname || "Stack"}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {stack.containers?.map((container, cidx) => (
                            <ContainerChip key={cidx} container={container} vmRunning={isRunning} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

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
                      color: "rgb(123, 0, 63)",
                    },
                  },
                  "& .MuiTabs-indicator": {
                    backgroundColor: "rgb(123, 0, 63)",
                    height: 3,
                    borderRadius: "3px 3px 0 0",
                  },
                }}
              >
                <Tab icon={<SettingsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Controls" />
                <Tab icon={<DnsIcon sx={{ fontSize: 20 }} />} iconPosition="start" label="Domain Names" />
              </Tabs>
            </div>

            {/* Tab Content */}
            <div className="p-6" style={{ height: "calc(100vh - 580px)", minHeight: "350px" }}>
              {/* Controls Tab */}
              {currentTab === 0 && (
                <div>
                  <p className="text-gray-600 mb-6">
                    Manage your virtual server with these tools:
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                    <ControlCard
                      icon={ViewInArIcon}
                      title="Dockge"
                      description="Manage Docker containers and stacks visually"
                      onClick={() => openTool("/")}
                      color="#2563eb"
                    />
                    <ControlCard
                      icon={FolderIcon}
                      title="File Browser"
                      description="Browse and manage files on your server"
                      onClick={() => openTool("/filebrowser")}
                      color="#16a34a"
                    />
                    <ControlCard
                      icon={TerminalIcon}
                      title="SSH Terminal"
                      description="Access command-line interface remotely"
                      onClick={() => openTool("/ssh/host/172.18.0.1")}
                      color="#9333ea"
                    />
                    <ControlCard
                      icon={CodeIcon}
                      title="Visual Studio Code"
                      description="Code using Visual Studio Code program on your computer"
                      onClick={() => openSystemPage("/docs/books/visual-studio-code/page/connect-vscode-with-your-server")}
                      color="#2563eb"
                    />
                  </div>
                </div>
              )}

              {/* DNS Tab */}
              {currentTab === 1 && (
                <DomainsListTable virtualServerID={virtualServerID} />
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

// Footer Component
const Footer = () => (
  <div
    className="h-8 flex justify-center items-center text-white text-xs"
    style={{ background: "rgb(123, 0, 63)" }}
  >
    Copyright © | All Rights Reserved | VUKnF
  </div>
);

export default VirtualServerPage;
