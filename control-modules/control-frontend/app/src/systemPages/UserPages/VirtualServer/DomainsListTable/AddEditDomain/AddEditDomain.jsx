// -----------------------------------------------------------
//  [*] AddEditDomain — the domain name dialog
//
//  Joy UI modal for one domain of a VM, in two modes decided
//  by rowData: prefilled edit (Save + Delete buttons) or
//  empty create (Create button). All three actions talk to
//  /api/vm/dns/<vm id> (POST create / PUT update / DELETE).
//
//  The "faculty supplied domain name" checkbox (default on)
//  splits the input into subdomain + a fixed-suffix dropdown
//  (.knf-hosting.lt is the only entry today); when editing,
//  a name ending in a faculty suffix is split back apart.
//  Every keystroke revalidates the full name against
//  /api/vm/dns/isvalid — the backend's message shows under
//  the field, green when valid, and Save/Create stays
//  disabled until the backend says valid.
//
//  Cloudflare yes/no hides behind "Show advanced options".
//
//  Used by:
//    - DomainsListTable — row click (edit) and Insert New
//      (create)
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import axios from "axios";

import { Button, Modal, ModalDialog, Stack, Typography } from "@mui/joy";
import { TextField, Box, FormControl, Grid, MenuItem, Checkbox } from "@mui/material";

import CancelIcon from '@mui/icons-material/Cancel';
import toast from 'react-hot-toast';


export default function AddEditDomain({ virtualServerID, rowData, setOpen, getData }) {

  const [data, setData] = useState(undefined);
  const [advancedOptions, setAdvancedOptions] = useState(false);

  const facultyDomains = ['.knf-hosting.lt'];
  const [isFacultyDomain, setIsFacultyDomain] = useState(true);
  const [facultyDomain, setFacultyDomain] = useState(facultyDomains[0]);


  const endpointUrl = "/api/vm/dns/"+virtualServerID;


  // Prefill for edit mode — a faculty-suffixed name is split
  // into its subdomain + suffix parts first
  useEffect(() => {
    if (rowData !== undefined) {

      for (const domain of facultyDomains) {
        if(rowData.row.domainname.endsWith(domain)) {
          setIsFacultyDomain(true);
          setFacultyDomain(domain);

          setData({
            id: rowData.row.id,
            domainname: rowData.row.domainname.replace(domain, ''),
            iscloudflare: rowData.row.iscloudflare,
            ssl: rowData.row.ssl || 0,
          });
          return;
        }
      }

      // Not a faculty domain — keep the full name in the field
      setData({
        id: rowData.row.id,
        domainname: rowData.row.domainname,
        iscloudflare: rowData.row.iscloudflare,
        ssl: rowData.row.ssl || 0,
      });
      setIsFacultyDomain(false);


    } else {
      // Creating a new domain
      setData({
        id: '',
        domainname: '',
        iscloudflare: 0,
        ssl: 0,
      });
    }
  }, [rowData]);


  // The backend validates the FULL name (suffix included) and
  // answers { isvalid, error_message } — the message is shown
  // in green when valid, red when not
  const [domainNameError, setDomainNameError] = useState('');
  const [domainNameValid, setDomainNameValid] = useState(false);
  async function isDomainNameValid(domainname) {
    if(isFacultyDomain) {
      domainname = domainname + facultyDomain;
    }
    const domainname_encoded = encodeURIComponent(domainname);
    const response = await axios.get('/api/vm/dns/isvalid?domainname=' + domainname_encoded + '&virtualserverid=' + virtualServerID, { withCredentials: true });
    setDomainNameError(response.data.error_message);
    setDomainNameValid(response.data.isvalid);
  }


  async function handleDomainNameChange(e) {
    let domainname = e.target.value;
    setData(prevData => ({ ...prevData, domainname: domainname }))
    isDomainNameValid(domainname);
  }

  // Revalidate when the prefill lands or the faculty checkbox
  // flips (the suffix changes the full name)
  useEffect(() => {
    if (data !== undefined) {
      isDomainNameValid(data.domainname);
    } else {
      isDomainNameValid('');
    }
  }, [data, isFacultyDomain]);


  async function handleCreateButton() {
    let fullDomainName = data.domainname;
    if(isFacultyDomain) {
      fullDomainName = fullDomainName + facultyDomain;
    }
    const requestData = {
      domainname: fullDomainName,
      iscloudflare: data.iscloudflare,
      ssl: data.ssl,
    }

    const response = await axios.post(endpointUrl, requestData, { withCredentials: true });
    if (response.data.message === 'ok') {
      toast.success(<b>Domain created</b>, { duration: 3000 });
    } else {
      toast.error(<b>Error:<br/>Error message: {response.data.message}</b>, { duration: 8000 });
    }

    getData();
    setOpen(false);
  }


  async function handleSaveButton() {
    let fullDomainName = data.domainname;
    if(isFacultyDomain) {
      fullDomainName = fullDomainName + facultyDomain;
    }
    const requestData = {
      domainid: data.id,
      domainname: fullDomainName,
      iscloudflare: data.iscloudflare,
      ssl: data.ssl,
    };

    const response = await axios.put(endpointUrl, requestData, { withCredentials: true });
    if (response.data.message === 'ok') {
      toast.success(<b>Domain updated</b>, { duration: 3000 });
    } else {
      toast.error(<b>Error:<br/>Error message: {response.data.message}</b>, { duration: 8000 });
    }

    getData();
    setOpen(false);
  }


  async function handleDeleteButton() {
    const response = await axios.delete(endpointUrl+"/"+data.id, { withCredentials: true });
    if (response.data.message === 'ok') {
      toast.success(<b>Domain deleted</b>, { duration: 3000 });
    } else {
      toast.error(<b>Error:<br/>Error message: {response.data.message}</b>, { duration: 8000 });
    }

    getData();
    setOpen(false);
  }


  // Nothing to render until the prefill effect has run
  if (data === undefined) {
    return null;
  }


  const disableSave = data.domainname.trim() === '';


  return (
    <Modal open={true} onClose={() => setOpen(false)}>
      <ModalDialog sx={{ width: '500px', borderRadius: 'md', boxShadow: 'lg', backgroundColor: 'white' }} >
        {/* Title row with the red close cross */}
        <Box>
          <Grid container direction="row">
            <Grid item xs={10} align="left">
              <Typography component="h2" fontSize="1.25em" mb="0.25em" style={{ marginBottom: '10px' }}>
                Domain Name
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
            {/* Checkbox for choosing a faculty supplied domain
                name subdomain */}
            <Box sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              width: '100%',
            }}>
              <Typography sx={{
                fontSize: '0.7em',
                marginRight: '8px'
              }}>
                Use faculty supplied domain name
              </Typography>
              <Checkbox
                style={{ color: 'rgb(123, 0, 63)' }}
                checked={isFacultyDomain}
                onChange={(e) => {
                  setIsFacultyDomain(e.target.checked);
                }}
              />
            </Box>

            {/* Faculty mode: subdomain + suffix dropdown; own
                domain mode: one full-name field. The backend's
                validation message sits underneath either way. */}
            {isFacultyDomain ?
              <>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <TextField
                    type="text"
                    required
                    label="Subdomain"
                    value={data.domainname}
                    onChange={(e) => handleDomainNameChange(e)}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    select
                    label="Domain"
                    value={facultyDomain}
                    onChange={(e) => setFacultyDomain(e.target.value)}
                    sx={{ minWidth: '200px' }}
                  >
                    {facultyDomains.map((domain, index) => (
                      <MenuItem key={index} value={domain}>{domain}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Typography style={{
                  color: domainNameValid ? 'green' : 'red',
                  fontSize: '0.8em',
                  fontWeight: 'bold'
                }}>
                  {domainNameError}
                </Typography>
              </>
              :
              <>
                <TextField
                  type="text"
                  required
                  label="Domain name"
                  value={data.domainname}
                  onChange={(e) => handleDomainNameChange(e)}
                />
                <Typography style={{ color: domainNameValid ? 'green' : 'red', fontSize: '0.8em', fontWeight: 'bold' }}>{domainNameError}</Typography>
              </>
            }


          </FormControl>

          <FormControl size="lg" color="primary">
            <TextField
              select
              label="HTTP or HTTPS ?"
              value={data.ssl}
              onChange={(e) => setData(prevData => ({ ...prevData, ssl: e.target.value }))}
            >
              <MenuItem value={1}>HTTPS</MenuItem>
              <MenuItem value={0}>HTTP</MenuItem>
            </TextField>
          </FormControl>


          {/* Advanced options fold — just Cloudflare for now */}
          <Box sx={{ border: '1px solid #ccc', borderRadius: '5px', padding: '10px', flexDirection: 'column' }}>
            <Box>
              <Button
                variant="outlined"
                onClick={() => setAdvancedOptions(!advancedOptions)}
                style={{ width: '100%', color: 'black' }}
              >
                {advancedOptions ? 'Hide advanced options' : 'Show advanced options'}
              </Button>
            </Box>
            {advancedOptions && (
              <>
                <FormControl size="lg" color="primary" sx={{ width: '100%', marginTop: '20px' }}>
                  <TextField
                    select
                    label="Cloudflare?"
                    value={data.iscloudflare}
                    onChange={(e) => setData(prevData => ({ ...prevData, iscloudflare: e.target.value }))}
                  >
                    <MenuItem value={1}>Yes</MenuItem>
                    <MenuItem value={0}>No</MenuItem>
                  </TextField>
                </FormControl>
              </>
            )}
          </Box>


          <div style={{ marginTop: '100px' }}></div>

          {/* Bottom buttons — Create alone, or Save + Delete
              when editing; both gated on backend validity */}
          <Box>
            <Grid container spacing={1} align="center" direction="row">
              <Grid item xs={rowData !== undefined ? 6 : 12}>
                <Button
                  type="submit"
                  style={{
                    backgroundColor: disableSave || !domainNameValid ? 'grey' : 'rgb(123, 0, 63)',
                    color: 'white',
                    boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                    width: '100%',
                  }}
                  onClick={() => {
                    if (rowData !== undefined && domainNameValid) {
                      handleSaveButton();
                    } else if (rowData === undefined && domainNameValid) {
                      handleCreateButton();
                    }
                  }}
                  disabled={disableSave || !domainNameValid}
                >
                  {rowData !== undefined ? 'Save' : 'Create'}
                </Button>
              </Grid>

              {rowData !== undefined && (
                <Grid item xs={6}>
                  <Button
                    style={{
                      backgroundColor: 'blue',
                      color: 'white',
                      boxShadow: '0px 8px 15px rgba(0, 0, 0, 0.1)',
                      width: '100%',
                    }}
                    onClick={() => handleDeleteButton()}
                  >
                    Delete
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
