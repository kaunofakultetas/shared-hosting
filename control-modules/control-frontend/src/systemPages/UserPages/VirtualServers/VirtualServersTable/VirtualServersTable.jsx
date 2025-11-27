"use client";
import React, { useState, useEffect } from "react";
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

                  {/* Actions Column */}
                  <TableCell>
                    {/* Stop propagation so row-click won't fire */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 1,
                        cursor: "default",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Start/Stop Button */}
                      <Button
                        variant="contained"
                        onClick={(e) => handleStartStop(e, row)}
                        color={row.state === "running" ? "error" : "success"}
                        sx={{ textTransform: "none", fontWeight: "bold" }}
                        startIcon={
                          row.state === "running" ? (
                            <StopIcon />
                          ) : (
                            <PlayArrowIcon />
                          )
                        }
                      >
                        {row.state === "running" ? "Stop" : "Start"}
                      </Button>

                      {/* Delete Button */}
                      <Button
                        variant="contained"
                        onClick={(e) => handleDelete(e, row)}
                        disabled={row.state === "running"}
                        sx={{
                          textTransform: "none",
                          fontWeight: "bold",
                          backgroundColor: theme.palette.error.main,
                          "&:hover": {
                            backgroundColor: theme.palette.error.dark,
                          },
                          // Force cursor for disabled button to remain default:
                          "&.Mui-disabled": {
                            cursor: "default",
                            backgroundColor: theme.palette.grey[500],
                            color: theme.palette.grey[300],
                          },
                        }}
                        startIcon={<DeleteIcon />}
                      >
                        Delete
                      </Button>
                    </Box>
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
