// -----------------------------------------------------------
//  [*] AddEditUser — the user account dialog
//
//  Joy UI modal for one account, in two modes decided by
//  rowData: prefilled edit (Save + hold-to-delete buttons,
//  password fields hidden behind a "Change Password" button)
//  or empty create (password fields always shown). Everything
//  goes to POST /api/admin/users — action "insertupdate" with
//  the fields (password empty = keep the current one) or
//  action "delete" with the id.
//
//  Save stays disabled until the email is filled and — when
//  the password fields are visible — both are non-empty and
//  matching. Delete is the shared hold-to-confirm
//  LongPressButton, dressed to match the dialog's Joy
//  buttons.
//
//  Used by:
//    - UsersListTable — row click (edit) and Insert New
//      (create)
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import axios from "axios";

import { Button, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import { TextField, Box, FormControl, Grid, MenuItem } from "@mui/material";

import { LongPressButton } from "@/components/LongPressButton";

import CancelIcon from '@mui/icons-material/Cancel';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import toast from 'react-hot-toast';







// -----------------------------------------------------------
// AddEditUser (default export)
// -----------------------------------------------------------
//
// Used by:
//   - UsersListTable — row click (edit) and Insert New
//     (create)
// -----------------------------------------------------------

export default function AddEditUser({ rowData, setOpen, getData }) {

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
      password: data.password // Empty when editing without a password change
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


  // Nothing to render until the prefill effect has run
  if (data === undefined) {
    return null;
  }


  const passwordsMatch = data.password === data.confirmPassword;

  // Inserting a new user or changing the password on edit:
  // require matching non-empty passwords. Editing without a
  // password change: empty fields are fine.
  const disableSave =
    (changePassword && (!passwordsMatch || data.password === '' || data.confirmPassword === '')) ||
    (data.email.trim() === '');


  return (
    <Modal open={true} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ width: '500px', borderRadius: 'md', boxShadow: 'lg', backgroundColor: 'white' }} >
        {/* Title row with the red close cross */}
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

          {/* Edit mode hides the password fields behind this
              button until a change is wanted */}
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

          {/* Bottom buttons — Create alone, or Save + the
              hold-to-delete button when editing */}
          <Box>
            <Grid container spacing={1} align="center" direction="row">
              <Grid item xs={rowData !== undefined ? 6 : 12}>
                {/* Joy button — the MUI theme doesn't reach it,
                    but its emitted CSS variables do */}
                <Button
                  type="submit"
                  style={{
                    backgroundColor: disableSave ? 'grey' : 'var(--mui-palette-primary-main)',
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
                  {/* MUI-based shared button — sx matches the
                      Joy siblings (radius 8, no uppercase) */}
                  <LongPressButton
                    onComplete={handleDeleteButton}
                    uncompletedToastMessage="Hold for 3 seconds to delete"
                    style={{
                      backgroundColor: 'blue',
                      color: 'white',
                      boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                      width: '100%',
                      userSelect: 'none',
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 600,
                      borderRadius: '8px',
                    }}
                  >
                    <DeleteIcon style={{ marginRight: 8 }} />
                    Delete
                  </LongPressButton>
                </Grid>
              )}

            </Grid>
          </Box>
        </Stack>
      </ModalDialog>
    </Modal>
  );
}
