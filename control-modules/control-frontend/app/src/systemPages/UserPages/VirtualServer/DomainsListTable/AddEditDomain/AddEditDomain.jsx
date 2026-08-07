// -----------------------------------------------------------
//  [*] AddEditDomain — the domain name dialog
//
//  The create/edit dialog for one domain of a VM, built on
//  UniversalModal with custom action buttons (the stock
//  Confirm/Cancel pair is hidden). All three actions talk to
//  /api/vm/dns/<vm id> (POST create / PUT update / DELETE).
//
//  Behavior worth knowing:
//    - the "faculty supplied domain name" checkbox (default
//      on) splits the input into subdomain + a fixed-suffix
//      dropdown (.knf-hosting.lt is the only entry today);
//      when editing, a name ending in a faculty suffix is
//      split back apart
//    - every keystroke revalidates the full name against
//      /api/vm/dns/isvalid — the backend's message shows
//      under the field, green when valid, and Save/Create
//      stays disabled until the backend says valid
//    - Cloudflare yes/no hides behind "Show advanced options"
//    - delete is a long-press button so it can't be hit by
//      accident; the dialog closes (animated) and the grid
//      refreshes after every backend answer
//
//  Split into (root component last):
//
//    FACULTY_DOMAINS — the offered faculty suffixes
//    ModalActions    — Save/Create + long-press Delete bar
//    DomainFields    — name/validation/ssl/advanced inputs
//    AddEditDomain   — state + API calls (default export)
//
//  Used by:
//    - DomainsListTable — row click (edit) and Insert New
//      (create)
// -----------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import axios from "axios";

import { Button, Stack, TextField, MenuItem, Box, Checkbox, Typography } from "@mui/material";

import { useTranslations } from "@/i18n";
import { UniversalModal } from "@/components/UniversalModal";
import { LongPressDeleteButton } from "@/components/LongPressButton";

import SaveIcon from '@mui/icons-material/Save';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import toast from 'react-hot-toast';


// The faculty-supplied suffixes offered in the dropdown
const FACULTY_DOMAINS = ['.knf-hosting.lt'];







// -----------------------------------------------------------
// ModalActions
// -----------------------------------------------------------
//
// The modal's custom action bar: the contained Save (edit) /
// Create (new) button — disabled until the backend validated
// the name — and, only when editing, the long-press Delete
// button next to it.
//
// Used by:
//   - AddEditDomain (below) — the modal's `actions` slot
// -----------------------------------------------------------

function ModalActions({ isEditing, disableSave, onSave, onDelete, t }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <Button
        variant="contained"
        fullWidth
        color="primary"
        sx={{ flex: 1 }}
        onClick={() => onSave()}
        disabled={disableSave}
      >
        {isEditing ? (
          <><SaveIcon style={{ marginRight: 8 }} />{t("DOMAIN_MODAL.save")}</>
        ) : (
          <><AddCircleOutlinedIcon style={{ marginRight: 8 }} />{t("DOMAIN_MODAL.create")}</>
        )}
      </Button>

      {isEditing &&
        <LongPressDeleteButton
          fullWidth
          sx={{ flex: 1 }}
          onComplete={onDelete}
          uncompletedToastMessage={t("DOMAIN_MODAL.hold_to_delete")}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          {t("DOMAIN_MODAL.delete")}
        </LongPressDeleteButton>
      }
    </div>
  );
}







// -----------------------------------------------------------
// DomainFields
// -----------------------------------------------------------
//
// The form body: the faculty checkbox, the name input (split
// subdomain + suffix dropdown in faculty mode, one full-name
// field otherwise) with the backend's validation message
// underneath, the HTTP/HTTPS select and the advanced-options
// fold with the Cloudflare select.
//
// Used by:
//   - AddEditDomain (below) — the modal's children
// -----------------------------------------------------------

function DomainFields({
  form,
  updateField,
  onDomainNameChange,
  isFacultyDomain,
  setIsFacultyDomain,
  facultyDomain,
  setFacultyDomain,
  domainNameError,
  domainNameValid,
  advancedOptions,
  setAdvancedOptions,
  t,
}) {
  return (
    <Stack spacing={3}>

      <Box>
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
            {t("DOMAIN_MODAL.use_faculty")}
          </Typography>
          <Checkbox
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
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              type="text"
              required
              label={t("DOMAIN_MODAL.subdomain")}
              value={form.domainname}
              onChange={(e) => onDomainNameChange(e)}
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label={t("DOMAIN_MODAL.domain")}
              value={facultyDomain}
              onChange={(e) => setFacultyDomain(e.target.value)}
              sx={{ minWidth: '200px' }}
            >
              {FACULTY_DOMAINS.map((domain, index) => (
                <MenuItem key={index} value={domain}>{domain}</MenuItem>
              ))}
            </TextField>
          </Box>
          :
          <TextField
            type="text"
            required
            fullWidth
            label={t("DOMAIN_MODAL.domain_name")}
            value={form.domainname}
            onChange={(e) => onDomainNameChange(e)}
          />
        }
        <Typography style={{
          color: domainNameValid ? 'green' : 'red',
          fontSize: '0.8em',
          fontWeight: 'bold'
        }}>
          {domainNameError}
        </Typography>
      </Box>

      <TextField select fullWidth label={t("DOMAIN_MODAL.protocol")} value={form.ssl} onChange={updateField('ssl')}>
        <MenuItem value={1}>{t("DOMAIN_MODAL.https")}</MenuItem>
        <MenuItem value={0}>{t("DOMAIN_MODAL.http")}</MenuItem>
      </TextField>

      {/* Advanced options fold — just Cloudflare for now */}
      <Box sx={{ border: '1px solid #ccc', borderRadius: '5px', padding: '10px', flexDirection: 'column' }}>
        <Button
          variant="outlined"
          onClick={() => setAdvancedOptions(!advancedOptions)}
          style={{ width: '100%', color: 'black' }}
        >
          {advancedOptions ? t("DOMAIN_MODAL.hide_advanced") : t("DOMAIN_MODAL.show_advanced")}
        </Button>
        {advancedOptions && (
          <TextField
            select
            fullWidth
            label={t("DOMAIN_MODAL.cloudflare")}
            value={form.iscloudflare}
            onChange={updateField('iscloudflare')}
            sx={{ marginTop: '20px' }}
          >
            <MenuItem value={1}>{t("DOMAIN_MODAL.yes")}</MenuItem>
            <MenuItem value={0}>{t("DOMAIN_MODAL.no")}</MenuItem>
          </TextField>
        )}
      </Box>

    </Stack>
  );
}







// -----------------------------------------------------------
// AddEditDomain (default export)
// -----------------------------------------------------------
//
// Owns the form state, the per-keystroke backend validation
// and the create/update/delete calls. The backend answers
// { message: 'ok' | reason } — either way the result is
// toasted, the grid refreshes via getData() and the dialog
// closes (animated, via UniversalModal's closeRef).
//
// Used by:
//   - DomainsListTable — row click (edit) and Insert New
//     (create)
// -----------------------------------------------------------

export default function AddEditDomain({ virtualServerID, rowData, setOpen, getData, sourceRect }) {

  const t = useTranslations("PAGES.vmDetail");

  // Animated close — the modal flies back before the parent
  // unmounts it (see UniversalModal's closeRef)
  const modalCloseRef = useRef(null);


  const isEditing = rowData !== undefined;

  // An edited name ending in a faculty suffix is split back
  // into its subdomain + suffix parts
  const matchedSuffix = isEditing
    ? FACULTY_DOMAINS.find((domain) => rowData.row.domainname.endsWith(domain))
    : undefined;

  const [isFacultyDomain, setIsFacultyDomain] = useState(isEditing ? Boolean(matchedSuffix) : true);
  const [facultyDomain, setFacultyDomain] = useState(matchedSuffix || FACULTY_DOMAINS[0]);
  const [advancedOptions, setAdvancedOptions] = useState(false);

  const [form, setForm] = useState({
    id:           isEditing ? rowData.row.id : '',
    domainname:   isEditing
      ? (matchedSuffix ? rowData.row.domainname.replace(matchedSuffix, '') : rowData.row.domainname)
      : '',
    iscloudflare: isEditing ? rowData.row.iscloudflare : 0,
    ssl:          isEditing ? (rowData.row.ssl || 0) : 0,
  });

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));


  const endpointUrl = "/api/vm/dns/" + virtualServerID;


  // The backend validates the FULL name (suffix included) and
  // answers { isvalid, error_message } — the message is shown
  // in green when valid, red when not
  const [domainNameError, setDomainNameError] = useState('');
  const [domainNameValid, setDomainNameValid] = useState(false);
  async function isDomainNameValid(domainname) {
    if (isFacultyDomain) {
      domainname = domainname + facultyDomain;
    }
    const domainname_encoded = encodeURIComponent(domainname);
    const response = await axios.get('/api/vm/dns/isvalid?domainname=' + domainname_encoded + '&virtualserverid=' + virtualServerID, { withCredentials: true });
    setDomainNameError(response.data.error_message);
    setDomainNameValid(response.data.isvalid);
  }

  async function handleDomainNameChange(e) {
    let domainname = e.target.value;
    setForm(prev => ({ ...prev, domainname: domainname }));
    isDomainNameValid(domainname);
  }

  // Revalidate on mount (prefill / empty name) and when the
  // faculty checkbox flips (the suffix changes the full name)
  useEffect(() => {
    isDomainNameValid(form.domainname);
  }, [form, isFacultyDomain]);


  // The full name the backend stores — subdomain + suffix in
  // faculty mode
  const fullDomainName = () =>
    isFacultyDomain ? form.domainname + facultyDomain : form.domainname;


  // Shared answer handling: toast, refresh the grid, close
  function finishRequest(response, successText) {
    if (response.data.message === 'ok') {
      toast.success(<b>{successText}</b>, { duration: 3000 });
    } else {
      toast.error(<b>{t("DOMAIN_MODAL.error", { message: response.data.message })}</b>, { duration: 8000 });
    }

    getData();
    modalCloseRef.current?.();
  }

  async function handleCreateButton() {
    const response = await axios.post(endpointUrl, {
      domainname: fullDomainName(),
      iscloudflare: form.iscloudflare,
      ssl: form.ssl,
    }, { withCredentials: true });
    finishRequest(response, t("DOMAIN_MODAL.created"));
  }

  async function handleSaveButton() {
    const response = await axios.put(endpointUrl, {
      domainid: form.id,
      domainname: fullDomainName(),
      iscloudflare: form.iscloudflare,
      ssl: form.ssl,
    }, { withCredentials: true });
    finishRequest(response, t("DOMAIN_MODAL.updated"));
  }

  async function handleDeleteButton() {
    const response = await axios.delete(endpointUrl + "/" + form.id, { withCredentials: true });
    finishRequest(response, t("DOMAIN_MODAL.deleted"));
  }


  const disableSave = form.domainname.trim() === '' || !domainNameValid;


  return (
    <UniversalModal
      open={true}
      onClose={() => setOpen(false)}
      closeRef={modalCloseRef}
      title={t("DOMAIN_MODAL.title")}
      sourceRect={sourceRect}
      maxWidth={500}
      fullWidth
      showCancel={false}
      showConfirm={false}
      actions={
        <ModalActions
          isEditing={isEditing}
          disableSave={disableSave}
          onSave={isEditing ? handleSaveButton : handleCreateButton}
          onDelete={handleDeleteButton}
          t={t}
        />
      }
    >
      <DomainFields
        form={form}
        updateField={updateField}
        onDomainNameChange={handleDomainNameChange}
        isFacultyDomain={isFacultyDomain}
        setIsFacultyDomain={setIsFacultyDomain}
        facultyDomain={facultyDomain}
        setFacultyDomain={setFacultyDomain}
        domainNameError={domainNameError}
        domainNameValid={domainNameValid}
        advancedOptions={advancedOptions}
        setAdvancedOptions={setAdvancedOptions}
        t={t}
      />
    </UniversalModal>
  );
}
