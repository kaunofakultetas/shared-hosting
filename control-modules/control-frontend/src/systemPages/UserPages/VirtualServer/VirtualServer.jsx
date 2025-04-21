'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import { Paper, Box, Typography, Button, Tabs, Tab, Chip, Divider, } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";

import DomainsListTable from "./DomainsListTable/DomainsListTable";





const VirtualServerPage = ({ virtualServerID, authdata }) => {
  
  const [vmData, setVmData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/vm/${virtualServerID}`);
        if(response.status === 401) {
          window.location.href = "/";
          return;
        }
        const data = await response.json();
        setVmData(data[0]);
        setLoading(false);
      } catch (error) {
        console.error("Error fetching VM data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, [virtualServerID]);


  const [currentTab, setCurrentTab] = useState(0);
  const handleChangeTab = (event, newValue) => {
    setCurrentTab(newValue);
  };



  if (loading) {
    return (
      <div>
        <Navbar />
        <Box sx={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 105px)', }}>
          <Sidebar authdata={authdata}/>
          <Box>
            <Typography>Loading VM data...</Typography>
          </Box>
        </Box>

        {/* Footer */}
        <div
          style={{
            background: 'rgb(123, 0, 63)',
            height: 30,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            color: 'white',
            fontSize: "0.7em",
          }}
        >
          Copyright © | All Rights Reserved | VUKnF
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      <Navbar />
      <div style={{ display: 'flex', flexDirection: 'row', backgroundColor: 'lightgrey', width: '100%' }}>
        <Sidebar authdata={authdata}/>

        <Box sx={{ flexGrow: 1, p: 1.5, width: '100%' }}>
          {/* Top Paper with VM overview */}
          <Paper sx={{ p: 2, mb: 2, display: 'flex', alignItems: 'center' }}>
            {/* Logo Section */}
            <Box sx={{ mr: 2, borderRadius: 4, backgroundColor: 'lightgrey', padding: 2 }}>
              <img src="/img/virtual-machine-icon.png" alt="Logo" style={{ width: 70, backgroundColor: 'white', padding: 15, borderRadius: 5 }} />
            </Box>
            {/* VM Information Section */}
            <Box>
              <Typography variant="h5" sx={{ mb: 1 }}>
                Virtual Server #{virtualServerID} - {vmData.name}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Owner:</strong> {vmData.owneremail}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>State:</strong> {vmData.state.charAt(0).toUpperCase() + vmData.state.slice(1)}
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Status:</strong> {vmData.status}
              </Typography>
            </Box>
          </Paper>

          {/* Tabs container */}
          <Paper sx={{ p: 2 }}>
            <Box>
              <Tabs
                // Custom border styling around Tabs
                style={{
                  borderStyle: "solid",
                  borderWidth: "2px",
                  borderRadius: "20px",
                  borderColor: "rgb(123, 0, 63)",
                }}
                value={currentTab}
                onChange={handleChangeTab}
                variant="fullWidth"
                TabIndicatorProps={{
                  style: {
                    backgroundColor: "rgb(123, 0, 63)",
                    height: "100%",
                    zIndex: 0,
                    borderRadius: "15px",
                  },
                }}
                sx={{
                  // Overwrite .MuiTabs-indicator color
                  "& .MuiTabs-indicator": {
                    backgroundColor: "rgb(123, 0, 63) !important",
                  },
                  // Selected tab text is white
                  "& .Mui-selected": {
                    color: "white !important",
                    zIndex: 1,
                  },
                }}
              >
                <Tab label="Controls" style={{ color: "black", fontWeight: "bold" }} disableRipple />
                <Tab label="DNS Entries" style={{ color: "black", fontWeight: "bold" }} disableRipple />
              </Tabs>
            </Box>

            {/* Tab panels */}
            {/* APŽVALGA PANEL */}
            <Box
              sx={{
                marginTop: 2,
                minHeight: 'calc(100vh - 410px)',
                display: "block"
              }}
            >
              {currentTab === 0 && (
                <Box sx={{ p: 2 }}>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    These tools allow you to manage your virtual server:
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: 200 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => {
                        document.cookie = `virtual-server-id=${vmData.id}; path=/;`;
                        const url = `${window.location.protocol}//${window.location.hostname}:8443/`;
                        window.open(url, "_blank");
                      }}
                    >
                      Dockge
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => {
                        document.cookie = `virtual-server-id=${vmData.id}; path=/;`;
                        const url = `${window.location.protocol}//${window.location.hostname}:8443/filebrowser`;
                        window.open(url, "_blank");
                      }}
                    >
                      Filebrowser
                    </Button>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => {
                        document.cookie = `virtual-server-id=${vmData.id}; path=/;`;
                        const url = `${window.location.protocol}//${window.location.hostname}:8443/ssh/host/172.18.0.1`;
                        window.open(url, "_blank");
                      }}
                    >
                      SSH
                    </Button>
                  </Box>
                </Box>
              )}
              {currentTab === 1 && (
                <div style={{ color: 'red'}}>   
                  <DomainsListTable virtualServerID={virtualServerID} />
                </div>
              )}
            </Box>

          </Paper>
        </Box>
      </div>

      {/* Footer */}
      <div
        style={{
          background: 'rgb(123, 0, 63)',
          height: 30,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          fontSize: "0.7em",
        }}
      >
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>
  );
};

export default VirtualServerPage;
