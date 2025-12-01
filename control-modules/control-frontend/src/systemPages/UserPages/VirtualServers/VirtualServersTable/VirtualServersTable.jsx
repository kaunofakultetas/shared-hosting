"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  Switch,
  FormControlLabel,
  CircularProgress,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import axios from "axios";

import AddCircleOutlinedIcon from "@mui/icons-material/AddCircleOutlined";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import DeleteIcon from "@mui/icons-material/Delete";

import AddNewVM from "./AddNewVM/AddNewVM";
import toast, { Toaster } from 'react-hot-toast';






const LONG_PRESS_DURATION = 3000;

const LongPressDeleteButton = ({ row, onDelete, theme }) => {
  const [progress, setProgress] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const isPressedRef = useRef(false);
  const eventRef = useRef(null);

  const isDisabled = row.state === "running";

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

  const startLongPress = useCallback((e) => {
    if (isDisabled) return;
    e.stopPropagation();
    e.preventDefault();
    
    eventRef.current = e;
    startTimeRef.current = Date.now();
    isPressedRef.current = true;
    setIsPressed(true);
    setProgress(0);
    animationRef.current = requestAnimationFrame(animate);
  }, [isDisabled, animate]);

  const cancelLongPress = useCallback((e) => {
    if (!isPressedRef.current) return;
    e.stopPropagation();
    
    const elapsed = startTimeRef.current ? Date.now() - startTimeRef.current : 0;
    
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
    return () => animationRef.current && cancelAnimationFrame(animationRef.current);
  }, []);

  const ProgressIcon = () => (
    <div className="relative flex items-center justify-center w-6 h-6">
      <CircularProgress
        variant="determinate"
        value={100}
        size={24}
        thickness={4}
        className="absolute text-white/30"
      />
      <CircularProgress
        variant="determinate"
        value={progress}
        size={24}
        thickness={4}
        sx={{
          color: "white",
          position: "absolute",
          transform: "rotate(-90deg)",
          "& .MuiCircularProgress-circle": {
            strokeLinecap: "round",
            transition: "none",
          },
        }}
      />
    </div>
  );

  return (
    <Button
      variant="contained"
      disabled={isDisabled}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onContextMenu={(e) => e.preventDefault()}
      className="select-none"
      sx={{
        textTransform: "none",
        fontWeight: "bold",
        backgroundColor: isPressed ? theme.palette.error.dark : theme.palette.error.main,
        "&:hover": { backgroundColor: theme.palette.error.dark },
        "&.Mui-disabled": {
          backgroundColor: theme.palette.grey[500],
          color: theme.palette.grey[300],
        },
      }}
      startIcon={isPressed ? <ProgressIcon /> : <DeleteIcon />}
    >
      Delete
    </Button>
  );
};




const VirtualServersTable = ({ authdata }) => {
  const theme = useTheme();

  // Local states
  const [loadingData, setLoadingData] = useState(true);
  const [data, setData] = useState([]);
  const [openBackdrop, setOpenBackdrop] = useState(false);
  const [showOtherUsers, setShowOtherUsers] = useState(false); // State for the switch

  // Fetch data from server
  const fetchData = async () => {
    try {
      const response = await axios.get("/api/vm", {
        params: { showOtherUsers: showOtherUsers.toString() }, // Pass the state as a query parameter
      });
      const sortedData = response.data.sort((a, b) => a.id - b.id);
      setData(sortedData);
      setLoadingData(false);
    } catch (error) {
      console.error("Error fetching data:", error);
      setLoadingData(false);
    }
  };


  // Auto-update data every 3 seconds
  useEffect(() => {
    fetchData(); // Initial fetch
    const intervalId = setInterval(fetchData, 3000); // Fetch every 3 seconds

    return () => clearInterval(intervalId); // Cleanup on component unmount
  }, [openBackdrop, showOtherUsers]);


  // 1. Row click -> open new URL
  const handleRowClick = (row) => {
    window.location.href = `/vm/${row.id}`;
  };


  // 2. Open the Backdrop for creating a new VM
  const triggerAddNewVM = () => {
    setOpenBackdrop(true);
  };


  // Start/Stop logic
  const handleStartStop = (e, row) => {
    e.stopPropagation();
    if (row.state === "running") {
      axios.post('/api/vm/control', {
        virtualServerID: row.id,
        action: 'stop'
      })
      toast.success(<b>Stopping server: #{row.id}</b>, {duration: 10000});
    } else {
      axios.post('/api/vm/control', {
        virtualServerID: row.id,
        action: 'start'
      })
      toast.success(<b>Starting server: #{row.id}</b>, {duration: 10000});
    }
  };


  // Delete logic
  const handleDelete = (e, row) => {
    e.stopPropagation();
    if (row.state !== "running") {
      axios.post('/api/vm/control', {
        virtualServerID: row.id,
        action: 'delete'
      })
      toast.success(<b>Deleting server: #{row.id}</b>, {duration: 10000});
    }
  };


  return (
    <Paper
      sx={{
        height: "calc(100vh - 105px)",
        width: "100%",
        borderRadius: 0,
        overflowY: "auto",
        padding: 2,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: theme.spacing(2),
          backgroundColor: theme.palette.background.paper,
        }}
      >
        <Typography variant="h5" sx={{ color: theme.palette.text.secondary }}>
          Virtual Servers
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          { authdata.admin === 1 && (
            <FormControlLabel
              control={
                <Switch
                  checked={showOtherUsers}
                  onChange={(e) => setShowOtherUsers(e.target.checked)}
                  color="primary"
                />
              }
              label="Show other users"
            />
          )}

          <Button
            variant="contained"
            color="primary"
            startIcon={<AddCircleOutlinedIcon />}
            sx={{
              textTransform: "none",
              fontWeight: "bold",
              height: 36,
            }}
            onClick={triggerAddNewVM}
          >
            New Virtual Server
          </Button>
        </Box>
      </Box>

      {/* Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: theme.palette.grey[200] }}>
              <TableCell>
                <strong>ID</strong>
              </TableCell>
              <TableCell>
                <strong>VM Name</strong>
              </TableCell>
              <TableCell>
                <strong>Status</strong>
              </TableCell>
              <TableCell>
                <strong>Uptime</strong>
              </TableCell>
              <TableCell>
                <strong>Docker Containers</strong>
              </TableCell>
              <TableCell>
                <strong>Actions</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {!loadingData &&
              data.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: "pointer" }}
                  onClick={() => handleRowClick(row)}
                >
                  <TableCell>{row.id}</TableCell>
                  <TableCell>{row.name || "Not set"}</TableCell>
                  <TableCell>
                    {row.state === "running" ? (
                      <Chip
                        label="Running"
                        color="success"
                        icon={<CheckCircleOutlineIcon />}
                        sx={{ fontWeight: "bold" }}
                      />
                    ) : (
                      <Chip
                        label="Stopped"
                        color="error"
                        icon={<StopCircleIcon />}
                        sx={{ fontWeight: "bold" }}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: "bold", color: "text.secondary" }}
                    >
                      {row.status || "N.D."}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {/* Updated logic for stacks/containers */}
                    {row.stacks && row.stacks.map((stack, sidx) => (
                      <Box key={sidx} sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                          {stack.stackname || "Not set"}:
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 1,
                            mt: 0.5,
                          }}
                        >
                          {stack.containers?.map((container, cidx) => {
                            const isRunning = container.state === "running";
                            return (
                              <Tooltip
                                key={`${container.image}-${cidx}`}
                                title={`${container.status || "N.D."}`}
                              >
                                <Chip
                                  label={container.names}
                                  color={isRunning ? "success" : "error"}
                                  variant="filled"
                                  size="small"
                                  sx={{
                                    fontSize: "0.75rem",
                                    borderRadius: 2,
                                  }}
                                />
                              </Tooltip>
                            );
                          })}
                        </Box>
                      </Box>
                    ))}
                  </TableCell>

                  <TableCell>
                    <div
                      className="flex flex-col gap-2 cursor-default"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="contained"
                        onClick={(e) => handleStartStop(e, row)}
                        color={row.state === "running" ? "error" : "success"}
                        sx={{ textTransform: "none", fontWeight: "bold" }}
                        startIcon={row.state === "running" ? <StopIcon /> : <PlayArrowIcon />}
                      >
                        {row.state === "running" ? "Stop" : "Start"}
                      </Button>
                      <LongPressDeleteButton row={row} onDelete={handleDelete} theme={theme} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add/Edit Dialog or Backdrop */}
      {openBackdrop && (
        <AddNewVM
          setOpen={setOpenBackdrop}
          // In real world, you might re-fetch from server or pass updated data
          getData={fetchData}
        />
      )}
    </Paper>
  );
};

export default VirtualServersTable;
