// -----------------------------------------------------------
//  [*] AddNewVM — the "New Virtual Server" dialog
//
//  Joy UI modal with the server name and an image dropdown
//  (Ubuntu 24.04 is the only choice). Create POSTs
//  action="create" to /api/vm/control, shows the "wait 1
//  minute" toast, refreshes the parent list and closes.
//
//  The vmData prop switches the dialog into an edit mode
//  (prefill + Save/Delete buttons) — but the only caller
//  never passes it, so that whole path is currently dormant,
//  including handleDeleteButton and its blue Delete button.
//
//  Used by:
//    - VirtualServersTable — opened by the New Server button
//      (always without vmData)
// -----------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Button, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import { TextField, Box, FormControl, Grid, MenuItem } from "@mui/material";
import CancelIcon from '@mui/icons-material/Cancel';
import toast from 'react-hot-toast';


export default function AddNewVM({ vmData, setOpen, getData }) {

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState({
    id: '',
    name: '',
    os: '',
  });
  const nameInputRef = useRef(null);


  // Focus the name input when modal opens — delayed a tick so
  // the modal is in the DOM first
  useEffect(() => {
    const timer = setTimeout(() => {
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);


  // Prefill for edit mode, defaults for create mode (see the
  // file header — only create mode is reachable today)
  useEffect(() => {
    if (vmData) {
      setData({
        id: vmData.id,
        name: vmData.name,
        os: vmData.os ?? 'linux', // default if not specified
      });
    } else {
      setData({
        id: '',
        name: '',
        os: 'linux',
      });
    }
  }, [vmData]);


  async function sendData(postData) {
    // Prevent double submission
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await axios.post("/api/vm/control", postData, { withCredentials: true });
      toast.success(<b>Server is being created. Please wait 1 minute...</b>, { duration: 30000 });

      // Refresh data in parent
      getData();
      // Close modal
      setOpen(false);
    } catch {
      toast.error(<b>Failed to create server. Please try again.</b>);
      setIsSubmitting(false);
    }
  }


  function handleSaveButton() {
    const action = vmData ? 'updatevm' : 'create';
    const postData = {
      action,
      name: data.name,
      os: data.os,
    };

    sendData(postData);
  }


  // Edit mode only — currently unreachable (no caller passes
  // vmData)
  async function handleDeleteButton() {
    if (!vmData) return;

    const postData = {
      action: 'deletevm',
      id: data.id,
    };
    sendData(postData);
  }


  const disableSave = data.name.trim() === '' || isSubmitting;


  // Enter submits the form
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !disableSave) {
      e.preventDefault();
      handleSaveButton();
    }
  }


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
        {/* Title row with the red close cross */}
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
              inputRef={nameInputRef}
              label="Virtual Server Name"
              value={data.name}
              onChange={(e) => setData(prev => ({ ...prev, name: e.target.value }))}
              onKeyDown={handleKeyDown}
            />
          </FormControl>

          {/* OS selection */}
          <FormControl size="lg" color="primary">
            <TextField
              select
              label="Virtual Server Image"
              value={data.os}
              onChange={(e) => setData(prev => ({ ...prev, os: e.target.value }))}
              onKeyDown={handleKeyDown}
            >
              <MenuItem value="linux">Ubuntu Server 24.04</MenuItem>
            </TextField>
          </FormControl>

          <Box sx={{ marginTop: '40px' }} />

          {/* Bottom Buttons */}
          <Box>
            <Grid container spacing={1} align="center" direction="row">
              <Grid item xs={vmData ? 6 : 12}>
                {/* Joy button — the MUI theme doesn't reach it,
                    but its emitted CSS variables do */}
                <Button
                  type="submit"
                  variant="contained"
                  sx={{
                    backgroundColor: disableSave ? 'grey' : 'var(--mui-palette-primary-main)',
                    color: 'white',
                    boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                    width: '100%',
                    transition: 'all 0.2s ease',
                    "&:hover": disableSave ? 'none' : { boxShadow: "0 4px 12px rgba(0,0,0,0.15)", backgroundColor: "var(--mui-palette-primary-dark)" },
                  }}
                  onClick={handleSaveButton}
                  disabled={disableSave}
                >
                  {isSubmitting ? 'Creating...' : (vmData ? 'Save' : 'Create')}
                </Button>
              </Grid>

              {/* Edit mode only — see the file header */}
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
