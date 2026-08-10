// -----------------------------------------------------------
//  [*] AddEditUser — the user account dialog
//
//  The create/edit dialog for platform accounts, built on
//  UniversalModal with custom action buttons (the stock
//  Confirm/Cancel pair is hidden).
//
//  Behavior worth knowing:
//    - rowData present → edit mode: the form is pre-filled
//      and the password fields stay hidden behind a "Change
//      Password" button; rowData undefined → create mode
//      with the password fields shown from the start
//    - Save stays disabled until the email is filled and,
//      when the password fields are visible, both are
//      non-empty and matching
//    - one POST endpoint (/api/admin/users) handles both
//      insertupdate (empty password = keep the current one)
//      and delete via the `action` field
//    - delete is a long-press button so it can't be hit by
//      accident; the dialog closes (animated) and the grid
//      refreshes after every backend answer
//
//  Split into (root component last):
//
//    ModalActions — Save/Create + long-press Delete bar
//    FormFields   — email/admin/enabled/password inputs
//    AddEditUser  — state + API calls (default export)
//
//  Used by:
//    - UsersListTable — row click (edit) and Insert New
//      (create)
// -----------------------------------------------------------

import { useState, useRef } from "react";
import axios from "axios";

import { Button, Stack, TextField, MenuItem } from "@mui/material";

import { useTranslations } from "@/i18n";
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
// The modal's custom action bar: the contained Save (edit) /
// Create (new) button, and — only when editing — the
// long-press Delete button next to it.
//
// Used by:
//   - AddEditUser (below) — the modal's `actions` slot
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
          <><SaveIcon style={{ marginRight: 8 }} />{t("EDIT_MODAL.save")}</>
        ) : (
          <><AddCircleOutlinedIcon style={{ marginRight: 8 }} />{t("EDIT_MODAL.create")}</>
        )}
      </Button>

      {isEditing &&
        <LongPressDeleteButton
          fullWidth
          sx={{ flex: 1 }}
          onComplete={onDelete}
          uncompletedToastMessage={t("EDIT_MODAL.hold_to_delete")}
        >
          <DeleteIcon sx={{ mr: 1 }} />
          {t("EDIT_MODAL.delete")}
        </LongPressDeleteButton>
      }
    </div>
  );
}







// -----------------------------------------------------------
// FormFields
// -----------------------------------------------------------
//
// The form body: email, the Admin?/Enabled? selects, then —
// while the password is not being changed in edit mode — the
// "Change Password" reveal button, or the password/confirm
// pair (with the mismatch error on the confirm field).
//
// Used by:
//   - AddEditUser (below) — the modal's children
// -----------------------------------------------------------

function FormFields({ form, updateField, isEditing, changePassword, setChangePassword, passwordsMatch, t }) {
  return (
    <Stack spacing={3}>

      <TextField required fullWidth type="email" label={t("EDIT_MODAL.email")} value={form.email} onChange={updateField('email')} />

      <TextField select fullWidth label={t("EDIT_MODAL.admin")} value={form.admin} onChange={updateField('admin')}>
        <MenuItem value={1}>{t("EDIT_MODAL.yes")}</MenuItem>
        <MenuItem value={0}>{t("EDIT_MODAL.no")}</MenuItem>
      </TextField>

      <TextField select fullWidth label={t("EDIT_MODAL.enabled")} value={form.enabled} onChange={updateField('enabled')}>
        <MenuItem value={1}>{t("EDIT_MODAL.yes")}</MenuItem>
        <MenuItem value={0}>{t("EDIT_MODAL.no")}</MenuItem>
      </TextField>

      {isEditing && !changePassword && (
        <Button
          variant="outlined"
          fullWidth
          sx={{ color: 'black', borderColor: 'black' }}
          onClick={() => setChangePassword(true)}
        >
          {t("EDIT_MODAL.change_password")}
        </Button>
      )}

      {changePassword && (
        <>
          <TextField
            required
            fullWidth
            type="password"
            label={t("EDIT_MODAL.password")}
            value={form.password}
            onChange={updateField('password')}
          />
          <TextField
            required
            fullWidth
            type="password"
            label={t("EDIT_MODAL.confirm_password")}
            value={form.confirmPassword}
            error={!passwordsMatch && form.confirmPassword !== ''}
            helperText={!passwordsMatch && form.confirmPassword !== '' ? t("EDIT_MODAL.mismatch") : ''}
            onChange={updateField('confirmPassword')}
          />
        </>
      )}

    </Stack>
  );
}







// -----------------------------------------------------------
// AddEditUser (default export)
// -----------------------------------------------------------
//
// Owns the form state and the API calls. The backend answers
// { type: 'ok' | 'error' } — either way the result is
// toasted, the grid refreshes via getData() and the dialog
// closes (animated, via UniversalModal's closeRef).
//
// Used by:
//   - UsersListTable — row click (edit) and Insert New
//     (create)
// -----------------------------------------------------------

export default function AddEditUser({ rowData, setOpen, getData, sourceRect }) {

  const t = useTranslations("PAGES.usersList");

  // Animated close — the modal flies back before the parent
  // unmounts it (see UniversalModal's closeRef)
  const modalCloseRef = useRef(null);


  const isEditing = rowData !== undefined;

  const [form, setForm] = useState({
    id:              isEditing ? rowData.row.id      : '',
    email:           isEditing ? rowData.row.email   : '',
    admin:           isEditing ? rowData.row.admin   : 0,
    enabled:         isEditing ? rowData.row.enabled : 1,
    password:        '',
    confirmPassword: '',
  });


  // When editing, the password fields are opt-in
  const [changePassword, setChangePassword] = useState(!isEditing);

  const updateField = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));


  // Failures arrive as real status codes (400/404/409), so
  // axios throws — the body still carries the translated-in
  // reason sentence
  async function sendData(postData) {
    try {
      await axios.post("/api/admin/users", postData, { withCredentials: true });
      toast.success(<b>{t("EDIT_MODAL.TOASTS.saved")}</b>, { duration: 3000 });
    } catch (error) {
      const reason = error.response?.data?.reason;
      if (reason) {
        toast.error(<b>{t("EDIT_MODAL.TOASTS.error", { reason })}</b>, { duration: 8000 });
      } else {
        toast.error(<b>{t("EDIT_MODAL.TOASTS.unknown")}</b>, { duration: 8000 });
      }
    }
    getData();
    modalCloseRef.current?.();
  }

  function handleSaveButton() {
    sendData({
      action: 'insertupdate',
      id: form.id,
      email: form.email,
      admin: form.admin,
      enabled: form.enabled,
      password: form.password // Empty when editing without a password change
    });
  }

  function handleDeleteButton() {
    sendData({ action: 'delete', id: form.id });
  }


  // Inserting a new user or changing the password on edit:
  // require matching non-empty passwords. Editing without a
  // password change: empty fields are fine.
  const passwordsMatch = form.password === form.confirmPassword;

  const disableSave =
    (changePassword && (!passwordsMatch || form.password === '' || form.confirmPassword === '')) ||
    (form.email.trim() === '');


  return (
    <UniversalModal
      open={true}
      onClose={() => setOpen(false)}
      closeRef={modalCloseRef}
      title={t("EDIT_MODAL.title")}
      sourceRect={sourceRect}
      maxWidth={500}
      fullWidth
      showCancel={false}
      showConfirm={false}
      actions={
        <ModalActions
          isEditing={isEditing}
          disableSave={disableSave}
          onSave={handleSaveButton}
          onDelete={handleDeleteButton}
          t={t}
        />
      }
    >
      <FormFields
        form={form}
        updateField={updateField}
        isEditing={isEditing}
        changePassword={changePassword}
        setChangePassword={setChangePassword}
        passwordsMatch={passwordsMatch}
        t={t}
      />
    </UniversalModal>
  );
}
