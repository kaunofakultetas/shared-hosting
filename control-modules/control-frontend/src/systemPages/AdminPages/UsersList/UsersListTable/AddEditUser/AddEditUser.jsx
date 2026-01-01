import React, { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

import { Button, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import { TextField, Box, FormControl, Grid, MenuItem, CircularProgress } from "@mui/material";

import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import toast from 'react-hot-toast';

const LONG_PRESS_DURATION = 3000;

// Long Press Delete Button Component
const LongPressDeleteButton = ({ onDelete, disabled }) => {
  const [progress, setProgress] = useState(0);
  const [isPressed, setIsPressed] = useState(false);
  const animationRef = useRef(null);
  const startTimeRef = useRef(null);
  const isPressedRef = useRef(false);

  const animate = useCallback(() => {
    if (!isPressedRef.current || !startTimeRef.current) return;

    const elapsed = Date.now() - startTimeRef.current;
    const newProgress = Math.min((elapsed / LONG_PRESS_DURATION) * 100, 100);
    setProgress(newProgress);

    if (elapsed >= LONG_PRESS_DURATION) {
      setIsPressed(false);
      isPressedRef.current = false;
      setProgress(0);
      onDelete();
      return;
    }

    animationRef.current = requestAnimationFrame(animate);
  }, [onDelete]);

  const startLongPress = useCallback(
    (e) => {
      if (disabled) return;
      e.stopPropagation();
      e.preventDefault();

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
    <Button
      disabled={disabled}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        backgroundColor: disabled ? 'grey' : 'blue',
        color: 'white',
        boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
        width: '100%',
        userSelect: 'none',
      }}
    >
      {isPressed ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24 }}>
          <CircularProgress
            variant="determinate"
            value={100}
            size={24}
            thickness={4}
            sx={{ color: 'rgba(255,255,255,0.3)', position: 'absolute' }}
          />
          <CircularProgress
            variant="determinate"
            value={progress}
            size={24}
            thickness={4}
            sx={{
              color: 'white',
              position: 'absolute',
              transform: 'rotate(-90deg)',
              '& .MuiCircularProgress-circle': {
                strokeLinecap: 'round',
                transition: 'none',
              },
            }}
          />
        </div>
      ) : (
        <>
          <DeleteIcon style={{ marginRight: 8 }} />
          Delete
        </>
      )}
    </Button>
  );
};




export default function AddEditUser({ rowData, highestRowID, setOpen, getData }) {
  const [data, setData] = useState(undefined);
  const [changePassword, setChangePassword] = useState(false);

  useEffect(() => {
    if (rowData !== undefined) {
      // Editing an existing user: start with no password change
      setData({
        id: rowData.row.id,
        email: rowData.row.email,
        admin: rowData.row.admin,
        enabled: rowData.row.enabled,
        password: '',
        confirmPassword: ''
      });
      setChangePassword(false);
    } else {
      // Creating a new user: password fields always required
      setData({
        id: '',
        email: '',
        admin: 0,
        enabled: 1,
        password: '',
        confirmPassword: ''
      });
      setChangePassword(true);
    }
  }, [rowData]);

  async function sendData(postData) {
    const response = await axios.post("/api/admin/users", postData, { withCredentials: true });

    if (response.data.type === 'ok') {
      toast.success(<b>Saved</b>, { duration: 3000 });
    } else if (response.data.type === 'error') {
      toast.error(<b>Error: {response.data.reason}</b>, { duration: 8000 });
    } else {
      toast.error(<b>Error: Unknown error.</b>, { duration: 8000 });
    }
    getData();
    setOpen(false);
  }

  function handleSaveButton() {
    const postData = {
      action: 'insertupdate',
      id: data.id,
      email: data.email,
      admin: data.admin,
      enabled: data.enabled,
      password: data.password // This will be empty if not changing password while editing
    };
    sendData(postData);
  }

  async function handleDeleteButton() {
    const postData = {
      action: 'delete',
      id: data.id
    };
    sendData(postData);
  }

  if (data === undefined) {
    return null;
  }

  const passwordsMatch = data.password === data.confirmPassword;
  
  // Determine conditions for disabling Save button
  // If inserting a new user or changing password on edit: require matching non-empty passwords.
  // If editing without changing password: passwords can be empty and it's allowed to save.
  const disableSave = 
    (changePassword && (!passwordsMatch || data.password === '' || data.confirmPassword === '')) ||
    (data.email.trim() === '');

  return (
    <Modal open={true} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ width: '500px', borderRadius: 'md', boxShadow: 'lg', backgroundColor: 'white' }} >
        <Box style={{ marginBottom: 20 }}>
          <Grid container direction="row">
            <Grid item xs={10} align="left">
              <Typography component="h2" fontSize="1.25em" mb="0.25em" style={{ marginBottom: '30px' }}>
                User
              </Typography>
            </Grid>

            <Grid item xs={2} align="right">
              <Button
                onClick={() => setOpen(false)}
                style={{ padding: 0, borderRadius: '50%', backgroundColor: 'transparent', outline: 'transparent' }}
              >
                <CancelIcon style={{ color: 'red' }} />
              </Button>
            </Grid>
          </Grid>
        </Box>

        <Stack spacing={3}>
          {/* <FormControl size="lg" color="primary">
            <TextField
              disabled
              style={{
                backgroundColor: "lightgrey"
              }}
              label="ID"
              value={data.id}
            />
          </FormControl> */}

          <FormControl size="lg" color="primary">
            <TextField
              type="email"
              required
              label="Email"
              value={data.email}
              onChange={(e) => setData(prevData => ({ ...prevData, email: e.target.value }))}
            />
          </FormControl>

          <FormControl size="lg" color="primary">
            <TextField
              select
              label="Admin?"
              value={data.admin}
              onChange={(e) => setData(prevData => ({ ...prevData, admin: e.target.value }))}
            >
              <MenuItem value={1}>Yes</MenuItem>
              <MenuItem value={0}>No</MenuItem>
            </TextField>
          </FormControl>

          <FormControl size="lg" color="primary">
            <TextField
              select
              label="Enabled?"
              value={data.enabled}
              onChange={(e) => setData(prevData => ({ ...prevData, enabled: e.target.value }))}
            >
              <MenuItem value={1}>Yes</MenuItem>
              <MenuItem value={0}>No</MenuItem>
            </TextField>
          </FormControl>

          {rowData !== undefined && !changePassword && (
            <Box>
              <Button
                variant="outlined"
                onClick={() => setChangePassword(true)}
                style={{ width: '100%', color: 'black', marginBottom: '10px' }}
              >
                Change Password
              </Button>
            </Box>
          )}

          {(changePassword || rowData === undefined) && (
            <>
              <FormControl size="lg" color="primary">
                <TextField
                  required
                  type="password"
                  label="Password"
                  value={data.password}
                  onChange={(e) => setData(prevData => ({ ...prevData, password: e.target.value }))}
                />
              </FormControl>

              <FormControl size="lg" color="primary">
                <TextField
                  required
                  type="password"
                  label="Repeat Password"
                  value={data.confirmPassword}
                  error={!passwordsMatch && data.confirmPassword !== ''}
                  helperText={!passwordsMatch && data.confirmPassword !== '' ? 'Passwords do not match' : ''}
                  onChange={(e) => setData(prevData => ({ ...prevData, confirmPassword: e.target.value }))}
                />
              </FormControl>
            </>
          )}

          <div style={{ marginTop: '100px' }}></div>

          <Box>
            <Grid container spacing={1} align="center" direction="row">
              <Grid item xs={rowData !== undefined ? 6 : 12}>
                <Button
                  type="submit"
                  style={{
                    backgroundColor: disableSave ? 'grey' : 'rgb(123, 0, 63)',
                    color: 'white',
                    boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                    width: '100%',
                  }}
                  onClick={() => handleSaveButton()}
                  disabled={disableSave}
                >
                  {rowData !== undefined ? (
                    <><SaveIcon style={{ marginRight: 8 }} />Save</>
                  ) : (
                    <><AddCircleOutlinedIcon style={{ marginRight: 8 }} />Create</>
                  )}
                </Button>
              </Grid>

              {rowData !== undefined && (
                <Grid item xs={6}>
                  <LongPressDeleteButton onDelete={handleDeleteButton} />
                </Grid>
              )}

            </Grid>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
