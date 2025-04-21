import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import { TextField, Box, FormControl, Grid, MenuItem } from "@mui/material";
import CancelIcon from '@mui/icons-material/Cancel';
import toast from 'react-hot-toast';


export default function AddNewVM({ vmData, setOpen, getData }) {
  // vmData: optional prop if you decide to allow editing in the future.
  // Currently, if vmData is undefined, we assume "Add New VM".

  const [data, setData] = useState({
    // Basic structure for a new VM
    id: '',
    name: '',
    os: '',
  });

  // If you do NOT plan to edit existing VMs, you can omit these effect checks.
  useEffect(() => {
    if (vmData) {
      // Editing an existing VM
      setData({
        id: vmData.id,
        name: vmData.name,
        os: vmData.os ?? 'linux', // default if not specified
      });
    } else {
      // Creating a brand new VM
      setData({
        id: '',
        name: '',
        os: 'linux',
      });
    }
  }, [vmData]);

  // Example API call to insert or update VM
  async function sendData(postData) {
    // Adjust the endpoint to your real API
    const response = await axios.post("/api/vm/control", postData, { withCredentials: true });
    toast.success(<b>Server is being created. Please wait 1 minute...</b>, { duration: 30000 });

    // Refresh data in parent
    getData();
    // Close modal
    setOpen(false);
  }

  // Handle Save
  function handleSaveButton() {
    const action = vmData ? 'updatevm' : 'create';
    const postData = {
      action,
      name: data.name,
      os: data.os,
    };

    sendData(postData);
  }

  // Handle Delete (if you need it)
  async function handleDeleteButton() {
    // Only relevant if editing an existing VM
    if (!vmData) return;

    const postData = {
      action: 'deletevm',
      id: data.id,
    };
    sendData(postData);
  }

  // ** Disable "Save" if name is empty (example logic) **
  const disableSave = data.name.trim() === '';

  // If data not yet loaded for edit (rare case), or you can remove this entirely
  if (!data) {
    return null;
  }

  return (
    <Modal open={true} onClose={() => setOpen(false)}>
      <ModalDialog
        sx={{ 
          width: '500px',
          borderRadius: 'md',
          boxShadow: 'lg',
          backgroundColor: 'white'
        }}
      >
        <Box style={{ marginBottom: 20 }}>
          <Grid container direction="row" alignItems="center">
            <Grid item xs={10} align="left">
              <Typography component="h2" fontSize="1.25em" mb="0.25em" style={{ marginBottom: '30px' }}>
                New Virtual Server
              </Typography>
            </Grid>
            <Grid item xs={2} align="right">
              <Button
                onClick={() => setOpen(false)}
                style={{
                  padding: 0,
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  outline: 'transparent'
                }}
              >
                <CancelIcon style={{ color: 'red' }} />
              </Button>
            </Grid>
          </Grid>
        </Box>

        <Stack spacing={3}>

          {/* VM Name */}
          <FormControl size="lg" color="primary">
            <TextField
              required
              label="Virtual Server Name"
              value={data.name}
              onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
            />
          </FormControl>

          {/* OS selection (example) */}
          <FormControl size="lg" color="primary">
            <TextField
              select
              label="Virtual Server Image"
              value={data.os}
              onChange={(e) => setData(prev => ({ ...prev, os: e.target.value }))}
            >
              <MenuItem value="linux">Ubuntu Server 24.04</MenuItem>
            </TextField>
          </FormControl>

          <Box sx={{ marginTop: '40px' }} />

          {/* Bottom Buttons */}
          <Box>
            <Grid container spacing={1} align="center" direction="row">
              <Grid item xs={vmData ? 6 : 12}>
                <Button
                  type="submit"
                  style={{
                    backgroundColor: disableSave ? 'grey' : 'rgb(123, 0, 63)',
                    color: 'white',
                    boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                    width: '100%',
                  }}
                  onClick={handleSaveButton}
                  disabled={disableSave}
                >
                  {vmData ? 'Save' : 'Create'}
                </Button>
              </Grid>

              {/* If editing an existing VM, allow deletion */}
              {vmData && (
                <Grid item xs={6}>
                  <Button
                    style={{
                      backgroundColor: 'blue',
                      color: 'white',
                      boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                      width: '100%',
                    }}
                    onClick={handleDeleteButton}
                  >
                    Delete VM
                  </Button>
                </Grid>
              )}
            </Grid>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
