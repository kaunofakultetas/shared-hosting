// -----------------------------------------------------------
//  [*] AddNewVM — the "New Virtual Server" dialog
//
//  Create dialog for virtual servers, built on UniversalModal
//  with custom action buttons (the stock Confirm/Cancel pair
//  is hidden): the server name (focused on open, Enter
//  submits) and an image dropdown (Ubuntu 24.04 is the only
//  choice). Create POSTs action="create" to /api/vm/control,
//  shows the "wait 1 minute" toast, refreshes the parent list
//  and closes (animated).
//
//  The vmData prop switches the dialog into an edit mode
//  (prefill + Save/Delete buttons) — but the only caller
//  never passes it, so that whole path is currently dormant,
//  including the long-press Delete button.
//
//  Split into (root component last):
//
//    ModalActions — Create/Save + dormant Delete bar
//    FormFields   — name + image inputs
//    AddNewVM     — state + API call (default export)
//
//  Used by:
//    - VirtualServersTable — opened by the New Server button
//      (always without vmData)
// -----------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import axios from "axios";

import { Button, Stack, TextField, MenuItem } from "@mui/material";

import { UniversalModal } from "@/components/UniversalModal";
import { LongPressDeleteButton } from "@/components/LongPressButton";

import SaveIcon from '@mui/icons-material/Save';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import toast from 'react-hot-toast';







// -----------------------------------------------------------
// ModalActions
// -----------------------------------------------------------
//
// The modal's custom action bar: the contained Create button
// ("Creating..." while the request runs, "Save" in the
// dormant edit mode), and — edit mode only — the long-press
// Delete button next to it.
//
// Used by:
//   - AddNewVM (below) — the modal's `actions` slot
// -----------------------------------------------------------

function ModalActions({ isEditing, isSubmitting, disableSave, onSave, onDelete }) {
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
        {isSubmitting ? (
          'Creating...'
        ) : isEditing ? (
          <><SaveIcon style={{ marginRight: 8 }} />Save</>
        ) : (
          <><AddCircleOutlinedIcon style={{ marginRight: 8 }} />Create</>
        )}
      </Button>

      {isEditing &&
        <LongPressDeleteButton
          fullWidth
          sx={{ flex: 1 }}
          onComplete={onDelete}
          uncompletedToastMessage="Hold for 3 seconds to delete"
        >
          <DeleteIcon sx={{ mr: 1 }} />
          Delete VM
        </LongPressDeleteButton>
      }
    </div>
  );
}







// -----------------------------------------------------------
// FormFields
// -----------------------------------------------------------
//
// The form body: the server name (autofocused by the root)
// and the image dropdown. Enter in either field submits.
//
// Used by:
//   - AddNewVM (below) — the modal's children
// -----------------------------------------------------------

function FormFields({ form, updateField, nameInputRef, onKeyDown }) {
  return (
    <Stack spacing={3}>

      <TextField
        required
        fullWidth
        inputRef={nameInputRef}
        label="Virtual Server Name"
        value={form.name}
        onChange={updateField('name')}
        onKeyDown={onKeyDown}
      />

      <TextField
        select
        fullWidth
        label="Virtual Server Image"
        value={form.os}
        onChange={updateField('os')}
        onKeyDown={onKeyDown}
      >
        <MenuItem value="linux">Ubuntu Server 24.04</MenuItem>
      </TextField>

    </Stack>
  );
}







// -----------------------------------------------------------
// AddNewVM (default export)
// -----------------------------------------------------------
//
// Owns the form state and the create call. On success the
// "being created" toast shows, the parent list refreshes via
// getData() and the dialog closes (animated, via
// UniversalModal's closeRef); on failure it stays open for
// another try.
//
// Used by:
//   - VirtualServersTable — opened by the New Server button
// -----------------------------------------------------------

export default function AddNewVM({ vmData, setOpen, getData }) {

  // Animated close — the modal flies back before the parent
  // unmounts it (see UniversalModal's closeRef)
  const modalCloseRef = useRef(null);


  const isEditing = Boolean(vmData);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    id:   isEditing ? vmData.id : '',
    name: isEditing ? vmData.name : '',
    os:   isEditing ? (vmData.os ?? 'linux') : 'linux',
  });

  const nameInputRef = useRef(null);

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));


  // Focus the name input when the modal opens — delayed a tick
  // so the portal-mounted dialog is in the DOM first
  useEffect(() => {
    const timer = setTimeout(() => {
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);


  async function sendData(postData) {
    // Prevent double submission
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      await axios.post("/api/vm/control", postData, { withCredentials: true });
      toast.success(<b>Server is being created. Please wait 1 minute...</b>, { duration: 30000 });

      getData();
      modalCloseRef.current?.();
    } catch {
      toast.error(<b>Failed to create server. Please try again.</b>);
      setIsSubmitting(false);
    }
  }

  function handleSaveButton() {
    sendData({
      action: isEditing ? 'updatevm' : 'create',
      name: form.name,
      os: form.os,
    });
  }

  // Edit mode only — currently unreachable (no caller passes
  // vmData)
  function handleDeleteButton() {
    sendData({ action: 'deletevm', id: form.id });
  }


  const disableSave = form.name.trim() === '' || isSubmitting;

  // Enter submits the form
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !disableSave) {
      e.preventDefault();
      handleSaveButton();
    }
  }


  return (
    <UniversalModal
      open={true}
      onClose={() => setOpen(false)}
      closeRef={modalCloseRef}
      title="New Virtual Server"
      maxWidth={500}
      fullWidth
      showCancel={false}
      showConfirm={false}
      actions={
        <ModalActions
          isEditing={isEditing}
          isSubmitting={isSubmitting}
          disableSave={disableSave}
          onSave={handleSaveButton}
          onDelete={handleDeleteButton}
        />
      }
    >
      <FormFields
        form={form}
        updateField={updateField}
        nameInputRef={nameInputRef}
        onKeyDown={handleKeyDown}
      />
    </UniversalModal>
  );
}
