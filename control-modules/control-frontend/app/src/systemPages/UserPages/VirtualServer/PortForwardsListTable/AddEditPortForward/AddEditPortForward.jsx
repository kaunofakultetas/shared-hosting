// -----------------------------------------------------------
//  [*] AddEditPortForward — the port forward dialog
//
//  The create/edit dialog for one public TCP port of a VM,
//  built on UniversalModal with custom action buttons (the
//  stock Confirm/Cancel pair is hidden). All three actions
//  talk to /api/vm/portforward/<vm id> (POST create / PUT
//  update / DELETE).
//
//  Behavior worth knowing:
//    - every keystroke revalidates both ports against
//      /api/vm/portforward/isvalid — the backend's message
//      shows under the fields, green when valid, and
//      Save/Create stays disabled until the backend says
//      valid; when editing, the row's own id rides along so
//      keeping the same public port stays valid
//    - validation refusals on save (taken in a race, quota,
//      too long a description) arrive as HTTP 400 — the
//      backend's reason sentence is toasted and the dialog
//      stays open for another try
//    - delete is a long-press button so it can't be hit by
//      accident; the dialog closes (animated) and the grid
//      refreshes after every backend answer
//
//  Split into (root component last):
//
//    usePortForwardValidation — backend port check
//    usePortForwardActions    — create/update/delete calls
//    ModalActions             — Save/Create + long-press
//                               Delete bar
//    PortForwardFields        — port/description inputs
//    AddEditPortForward       — state + wiring (default
//                               export)
//
//  Used by:
//    - PortForwardsListTable — row click (edit) and Insert
//      New (create)
// -----------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import axios from "axios";

import { Button, Stack, TextField, Typography } from "@mui/material";

import { useTranslations } from "@/i18n";
import { UniversalModal } from "@/components/UniversalModal";
import { LongPressDeleteButton } from "@/components/LongPressButton";

import SaveIcon from '@mui/icons-material/Save';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';
import DeleteIcon from '@mui/icons-material/Delete';
import toast from 'react-hot-toast';







// -----------------------------------------------------------
// usePortForwardValidation
// -----------------------------------------------------------
//
//   const { portError, portValid } =
//     usePortForwardValidation(publicport, internalport,
//                              portForwardID)
//
// The backend port check: every change to either port re-asks
// /api/vm/portforward/isvalid — pool bounds, integers and the
// taken check live on the backend, so the pool can move
// without touching the frontend. portForwardID is the edit
// case: the row's own id rides along and keeping the same
// public port stays valid. The backend answers { isvalid,
// error_message }; the message is shown in green when valid,
// red when not, and Save/Create keys on the flag.
//
// Used by:
//   - AddEditPortForward (below)
// -----------------------------------------------------------

function usePortForwardValidation(publicport, internalport, portForwardID) {

  const [portError, setPortError] = useState('');
  const [portValid, setPortValid] = useState(false);


  // Latest-wins: the cleanup aborts the in-flight check when
  // a port changes again (or the dialog closes), so a slow
  // answer can never overwrite a newer one
  useEffect(() => {
    const controller = new AbortController();

    const validate = async () => {
      try {
        let url = '/api/vm/portforward/isvalid?publicport=' + encodeURIComponent(publicport)
                + '&internalport=' + encodeURIComponent(internalport);
        if (portForwardID !== undefined) {
          url += '&portforwardid=' + encodeURIComponent(portForwardID);
        }
        const response = await axios.get(url, { withCredentials: true, signal: controller.signal });
        setPortError(response.data.error_message);
        setPortValid(response.data.isvalid);
      } catch (error) {
        // Aborted = superseded by a newer keystroke — ignore
        if (!axios.isCancel(error)) throw error;
      }
    };
    validate();

    return () => controller.abort();
  }, [publicport, internalport, portForwardID]);


  return { portError, portValid };
}







// -----------------------------------------------------------
// usePortForwardActions
// -----------------------------------------------------------
//
//   const { create, save, remove } = usePortForwardActions({...})
//
// The three backend calls of the dialog — POST create, PUT
// update, DELETE — against /api/vm/portforward/<vm id>. A 200
// toasts success, refreshes the grid via getData() and closes
// the dialog (animated, via closeModal); a 400 (port taken in
// a race, quota reached, description too long) toasts the
// backend's reason sentence and leaves the dialog open.
//
// Used by:
//   - AddEditPortForward (below)
// -----------------------------------------------------------

function usePortForwardActions({ virtualServerID, form, getData, closeModal, t }) {

  const endpointUrl = "/api/vm/portforward/" + virtualServerID;


  // Shared answer handling: toast, refresh the grid, close
  function finishRequest(successText) {
    toast.success(<b>{successText}</b>, { duration: 3000 });
    getData();
    closeModal();
  }

  // Axios throws on the backend's 400 refusals — surface the
  // reason sentence and keep the dialog open for another try
  function toastError(error) {
    const reason = error.response?.data?.reason || error.message;
    toast.error(<b>{t("PORTFORWARD_MODAL.error", { message: reason })}</b>, { duration: 8000 });
  }


  async function create() {
    try {
      await axios.post(endpointUrl, {
        publicport: form.publicport,
        internalport: form.internalport,
        description: form.description,
      }, { withCredentials: true });
      finishRequest(t("PORTFORWARD_MODAL.created"));
    } catch (error) {
      toastError(error);
    }
  }

  async function save() {
    try {
      await axios.put(endpointUrl, {
        portforwardid: form.id,
        publicport: form.publicport,
        internalport: form.internalport,
        description: form.description,
      }, { withCredentials: true });
      finishRequest(t("PORTFORWARD_MODAL.updated"));
    } catch (error) {
      toastError(error);
    }
  }

  async function remove() {
    try {
      await axios.delete(endpointUrl + "/" + form.id, { withCredentials: true });
      finishRequest(t("PORTFORWARD_MODAL.deleted"));
    } catch (error) {
      toastError(error);
    }
  }


  return { create, save, remove };
}







// -----------------------------------------------------------
// ModalActions
// -----------------------------------------------------------
//
// The modal's custom action bar: the contained Save (edit) /
// Create (new) button — disabled until the backend validated
// the ports — and, only when editing, the long-press Delete
// button next to it.
//
// Used by:
//   - AddEditPortForward (below) — the modal's `actions` slot
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
          <><SaveIcon style={{ marginRight: 8 }} />{t("PORTFORWARD_MODAL.save")}</>
        ) : (
          <><AddCircleOutlinedIcon style={{ marginRight: 8 }} />{t("PORTFORWARD_MODAL.create")}</>
        )}
      </Button>

      {isEditing &&
        <LongPressDeleteButton
          fullWidth
          sx={{ flex: 1 }}
          onComplete={onDelete}
          uncompletedToastMessage={t("PORTFORWARD_MODAL.hold_to_delete")}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          {t("PORTFORWARD_MODAL.delete")}
        </LongPressDeleteButton>
      }
    </div>
  );
}







// -----------------------------------------------------------
// PortForwardFields
// -----------------------------------------------------------
//
// The form body: the public port (the pool number a client
// connects to) and the server port (where the app listens
// inside the VM) side by side, the backend's validation
// message underneath, and the optional description.
//
// Used by:
//   - AddEditPortForward (below) — the modal's children
// -----------------------------------------------------------

function PortForwardFields({ form, updateField, portError, portValid, t }) {
  return (
    <Stack spacing={3}>

      <div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <TextField
            type="number"
            required
            label={t("PORTFORWARD_MODAL.publicport")}
            value={form.publicport}
            onChange={updateField('publicport')}
            sx={{ flex: 1 }}
          />
          <TextField
            type="number"
            required
            label={t("PORTFORWARD_MODAL.internalport")}
            value={form.internalport}
            onChange={updateField('internalport')}
            sx={{ flex: 1 }}
          />
        </div>
        <Typography style={{
          color: portValid ? 'green' : 'red',
          fontSize: '0.8em',
          fontWeight: 'bold'
        }}>
          {portError}
        </Typography>
      </div>

      <TextField
        type="text"
        fullWidth
        label={t("PORTFORWARD_MODAL.description")}
        value={form.description}
        onChange={updateField('description')}
        slotProps={{ htmlInput: { maxLength: 100 } }}
      />

    </Stack>
  );
}







// -----------------------------------------------------------
// AddEditPortForward (default export)
// -----------------------------------------------------------
//
// Owns the form state and wires the validation and action
// hooks into the modal — the backend traffic itself lives in
// usePortForwardValidation and usePortForwardActions above.
//
// Used by:
//   - PortForwardsListTable — row click (edit) and Insert New
//     (create)
// -----------------------------------------------------------

export default function AddEditPortForward({ virtualServerID, rowData, setOpen, getData, sourceRect }) {

  const t = useTranslations("PAGES.vmDetail");

  // Animated close — the modal flies back before the parent
  // unmounts it (see UniversalModal's closeRef)
  const modalCloseRef = useRef(null);


  const isEditing = rowData !== undefined;

  const [form, setForm] = useState({
    id:           isEditing ? rowData.row.id : '',
    publicport:   isEditing ? rowData.row.publicport : '',
    internalport: isEditing ? rowData.row.internalport : '',
    description:  isEditing ? rowData.row.description : '',
  });

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));


  const { portError, portValid } =
    usePortForwardValidation(form.publicport, form.internalport, isEditing ? rowData.row.id : undefined);

  const { create, save, remove } = usePortForwardActions({
    virtualServerID,
    form,
    getData,
    closeModal: () => modalCloseRef.current?.(),
    t,
  });


  const disableSave = !portValid;


  return (
    <UniversalModal
      open={true}
      onClose={() => setOpen(false)}
      closeRef={modalCloseRef}
      title={t("PORTFORWARD_MODAL.title")}
      sourceRect={sourceRect}
      maxWidth={500}
      fullWidth
      showCancel={false}
      showConfirm={false}
      actions={
        <ModalActions
          isEditing={isEditing}
          disableSave={disableSave}
          onSave={isEditing ? save : create}
          onDelete={remove}
          t={t}
        />
      }
    >
      <PortForwardFields
        form={form}
        updateField={updateField}
        portError={portError}
        portValid={portValid}
        t={t}
      />
    </UniversalModal>
  );
}
