// -----------------------------------------------------------
//  [*] UniversalModal — the shared modal dialog
//
//  One configurable component covering the common cases:
//  title/description header with an optional variant icon,
//  arbitrary children as the body, and either the standard
//  Confirm/Cancel pair or fully custom action buttons.
//
//  Variants ("default" | "danger" | "warning" | "info" |
//  "success") pick the header icon and the confirm button
//  color.
//
//  Every modal opens with a flow animation: by default the
//  dialog grows out of the screen center; pass `sourceRect`
//  (the trigger element's rectangle, e.g.
//  e.currentTarget.getBoundingClientRect()) and it flies out
//  of that element instead — dock style — and flies back on
//  close.
//
//  Split into (main component, then presets):
//
//    VARIANTS         — per-variant icon + colors
//    ModalHeader      — icon, title, description, close (×)
//    StandardActions  — the Confirm/Cancel button bar
//    UniversalModal   — the modal itself (default export)
//    ConfirmModal / DeleteModal / AlertModal / WarningModal
//                     — thin presets with translated defaults
//
//  Imported via the folder's index.js:
//    @/components/UniversalModal
// -----------------------------------------------------------

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Modal,
  Paper,
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Divider,
} from "@mui/material";

import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

import { useTranslations } from "@/i18n";


// One duration for everything the flow animation moves — the
// paper's flight, both fades AND the unmount delay. Keep them
// identical or the close flight gets cut off before landing.
const FLIGHT_MS = 400;


// Variant configurations — header icon, confirm button color
const VARIANTS = {
  default: {
    icon: null,
    confirmColor: "primary",
    iconColor: "primary",
  },
  danger: {
    icon: ErrorOutlineIcon,
    confirmColor: "error",
    iconColor: "error",
  },
  warning: {
    icon: WarningAmberIcon,
    confirmColor: "warning",
    iconColor: "warning",
  },
  info: {
    icon: InfoOutlinedIcon,
    confirmColor: "info",
    iconColor: "info",
  },
  success: {
    icon: CheckCircleOutlineIcon,
    confirmColor: "success",
    iconColor: "success",
  },
};







// -----------------------------------------------------------
// ModalHeader
// -----------------------------------------------------------
//
// Top section: the variant icon, title and description on the
// left, the close (×) button on the right. Bottom padding is
// tighter when something follows underneath.
//
// Used by:
//   - UniversalModal (below)
// -----------------------------------------------------------

function ModalHeader({ icon: Icon, iconColor, title, description, hasBody, showCloseButton, onClose }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        p: 3,
        pb: description || hasBody ? 2 : 3,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, marginBottom: 1 }}>
        {Icon && (
          <Icon
            color={iconColor}
            sx={{ fontSize: 28 }}
          />
        )}
        <Box>
          {title && (
            <Typography
              id="universal-modal-title"
              variant="h6"
              component="h2"
              sx={{ fontWeight: 600 }}
            >
              {title}
            </Typography>
          )}
          {description && (
            <Typography
              id="universal-modal-description"
              variant="body2"
              color="text.secondary"
              sx={{ mt: 0.5 }}
            >
              {description}
            </Typography>
          )}
        </Box>
      </Box>

      {showCloseButton && (
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            ml: 1,
            color: 'text.secondary',
            '&:hover': { color: 'error.main' }
          }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}







// -----------------------------------------------------------
// StandardActions
// -----------------------------------------------------------
//
// The default footer: right-aligned Cancel + Confirm buttons.
// While `loading` both are disabled and the confirm button
// shows a spinner.
//
// Used by:
//   - UniversalModal (below) — when no custom `actions` given
// -----------------------------------------------------------

function StandardActions({ showCancel, cancelText, onCancel, showConfirm, confirmText, confirmColor, onConfirm, confirmDisabled, loading }) {
  return (
    <>
      <Divider />
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1.5,
          p: 2,
          px: 3,
        }}
      >
        {showCancel && (
          <Button
            variant="outlined"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </Button>
        )}
        {showConfirm && (
          <Button
            variant="contained"
            color={confirmColor}
            onClick={onConfirm}
            disabled={confirmDisabled || loading}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {confirmText}
          </Button>
        )}
      </Box>
    </>
  );
}







// -----------------------------------------------------------
// UniversalModal (default export)
// -----------------------------------------------------------
//
// Used by:
//   - AddNewVM / AddEditDomain / AddEditUser — the add/edit
//     dialogs (custom `actions`, stock buttons hidden)
//   - QuickRegistrationWidget — the dark code-share modal
//     (headerless, dark sx override)
// -----------------------------------------------------------

export default function UniversalModal({
  // Control
  open,
  onClose,

  // Content
  title,
  description,
  children,

  // Actions - custom JSX for buttons (overrides confirm/cancel)
  actions,

  // Standard action buttons (used when 'actions' prop is not
  // provided); confirmText/cancelText fall back to translated
  // defaults when the caller gives none
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  showCancel = true,
  showConfirm = true,
  confirmDisabled = false,

  // Variants: "default" | "danger" | "warning" | "info" | "success"
  variant = "default",

  // Sizing
  maxWidth = 500,
  fullWidth = false,

  // Loading state
  loading = false,

  // Behavior
  closeOnConfirm = true,
  closeOnBackdropClick = true,
  showCloseButton = true,

  // Flow animation origin — the trigger element's screen
  // rectangle; without it the modal grows from the center
  sourceRect = null,

  // Animated close for the consumer's OWN handlers: pass a
  // ref and call closeRef.current() instead of closing your
  // open-state directly — the return flight plays first,
  // onClose fires after it lands
  closeRef = null,

  // Custom styling
  sx = {},
  contentSx = {},
}) {

  const t = useTranslations("COMPONENTS.universalModal");

  const variantConfig = VARIANTS[variant] || VARIANTS.default;


  // ---- Flow animation ----
  // `entered` drives the transition (start pose → resting
  // pose); `exiting` keeps the modal mounted while the
  // reverse flight plays after `open` goes false.
  const paperRef = useRef(null);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [flightFrom, setFlightFrom] = useState('translate(-50%, -50%) scale(0.92)');

  // The close must start IN THE SAME RENDER that receives
  // open=false — waiting for an effect would leave one frame
  // with mounted=false, and MUI would unmount the paper
  // before the return flight can play. This is the standard
  // derive-state-during-render pattern. Skipped while a
  // requestClose flight is already running (that path flips
  // open=false only AFTER landing).
  const closingRef = useRef(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open && !closingRef.current) {
      setExiting(true);
      setEntered(false);
    }
  }

  const mounted = open || exiting;

  // Animated close for every internal trigger (backdrop, Esc,
  // the header ×, Cancel, closeOnConfirm): fly back FIRST,
  // call onClose only after landing — most consumers unmount
  // the whole modal on close, which would otherwise cut the
  // flight off instantly. Exposed through closeRef so the
  // consumer's own save/delete handlers can use it too.
  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setExiting(true);
    setEntered(false);
    setTimeout(() => {
      onClose?.();
      closingRef.current = false;
    }, FLIGHT_MS);
  };

  if (closeRef) {
    closeRef.current = requestClose;
  }

  // Entering: derive the start pose — over the source element
  // when given (offsetWidth/Height are transform-independent,
  // and the paper's center always rests at the viewport
  // center), a plain center scale otherwise — then release it
  // a frame later so the transition has something to play.
  // The measurement waits one frame because MUI mounts the
  // modal through a portal, so the paper does not exist yet
  // when this effect first runs; the paper stays at opacity 0
  // until `entered`, which hides that frame.
  useLayoutEffect(() => {
    if (!open) return;
    setExiting(false);

    let raf2;
    const raf1 = requestAnimationFrame(() => {
      let start = 'translate(-50%, -50%) scale(0.92)';
      const paper = paperRef.current;
      if (sourceRect && paper) {
        const dx = (sourceRect.left + sourceRect.width / 2) - window.innerWidth / 2;
        const dy = (sourceRect.top + sourceRect.height / 2) - window.innerHeight / 2;
        // UNIFORM scale (the smaller ratio) — the modal keeps
        // its own proportions while flying, instead of being
        // stretched into the source's shape (a grid row would
        // smear it across the whole screen width)
        const scale = Math.min(
          sourceRect.width / paper.offsetWidth,
          sourceRect.height / paper.offsetHeight
        );
        start = `translate(-50%, -50%) translate(${dx}px, ${dy}px) scale(${scale})`;
      }
      setFlightFrom(start);
      raf2 = requestAnimationFrame(() => setEntered(true));
    });

    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, sourceRect]);

  // Leaving: the render-phase block above put us in the exit
  // pose — here we only unmount once the return flight landed
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => setExiting(false), FLIGHT_MS);
    return () => clearTimeout(timer);
  }, [exiting]);


  // onConfirm is awaited so closeOnConfirm doesn't shut the modal
  // before an async confirm (e.g. an API call) has finished
  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm();
    }
    if (closeOnConfirm) {
      requestClose();
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
    requestClose();
  };

  // MUI reports why the modal wants to close; ignore backdrop
  // clicks when closeOnBackdropClick is off (Esc still closes)
  const handleBackdropClick = (event, reason) => {
    if (reason === 'backdropClick' && !closeOnBackdropClick) {
      return;
    }
    requestClose();
  };


  const showActionBar = actions || showConfirm || showCancel;


  return (
    <Modal
      open={mounted}
      onClose={handleBackdropClick}
      aria-labelledby="universal-modal-title"
      aria-describedby="universal-modal-description"
      slotProps={{
        backdrop: {
          sx: {
            backgroundColor: 'rgba(0, 0, 0, 0.15)',
            // The blur is animated explicitly — backdrop-filter
            // ignores the element's own opacity, so fading alone
            // would leave the page blurred until unmount
            backdropFilter: entered ? 'blur(6px)' : 'blur(0px)',
            opacity: entered ? 1 : 0,
            transition: `opacity ${FLIGHT_MS}ms ease, backdrop-filter ${FLIGHT_MS}ms ease`,
          },
        },
      }}
    >
      <Paper
        ref={paperRef}
        sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: entered ? 'translate(-50%, -50%)' : flightFrom,
          opacity: entered ? 1 : 0,
          // No transition while the start pose is being set up —
          // the paper must TELEPORT there, then animate out of it
          // (and back into it while exiting)
          transition: entered || exiting
            ? `transform ${FLIGHT_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${FLIGHT_MS}ms ease`
            : 'none',
          width: fullWidth ? '90%' : 'auto',
          maxWidth: maxWidth,
          minWidth: 300,
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 2,
          boxShadow: 24,
          outline: 'none',   // Modal focuses the Paper; hide the focus ring
          ...sx,
        }}
      >
        <ModalHeader
          icon={variantConfig.icon}
          iconColor={variantConfig.iconColor}
          title={title}
          description={description}
          hasBody={Boolean(children)}
          showCloseButton={showCloseButton}
          onClose={requestClose}
        />

        {/* Content */}
        {children && (
          <Box sx={{ px: 3, pb: showActionBar ? 2 : 3, ...contentSx }}>
            {children}
          </Box>
        )}

        {/* Custom actions — block layout so callers can use full-width buttons */}
        {actions && (
          <>
            <Divider />
            <Box sx={{ p: 2, px: 3 }}>
              {actions}
            </Box>
          </>
        )}

        {/* Standard Confirm/Cancel bar — only when no custom actions */}
        {!actions && (showConfirm || showCancel) && (
          <StandardActions
            showCancel={showCancel}
            cancelText={cancelText ?? t("cancel")}
            onCancel={handleCancel}
            showConfirm={showConfirm}
            confirmText={confirmText ?? t("confirm")}
            confirmColor={variantConfig.confirmColor}
            onConfirm={handleConfirm}
            confirmDisabled={confirmDisabled}
            loading={loading}
          />
        )}
      </Paper>
    </Modal>
  );
}







// -----------------------------------------------------------
// ConfirmModal
// -----------------------------------------------------------
//
// Preset: generic "are you sure?" dialog — default variant,
// translated "Confirm action" title and Confirm/Cancel pair.
// All props pass through, so anything can still be
// overridden.
//
// Nothing calls this preset here at the moment — kept as
// part of the modal's stock preset set.
// -----------------------------------------------------------

export function ConfirmModal({
  title,
  confirmText,
  ...props
}) {

  const t = useTranslations("COMPONENTS.universalModal");

  return (
    <UniversalModal
      title={title ?? t("CONFIRM_MODAL.title")}
      confirmText={confirmText ?? t("CONFIRM_MODAL.confirm")}
      showCancel={true}
      {...props}
    />
  );
}







// -----------------------------------------------------------
// DeleteModal
// -----------------------------------------------------------
//
// Preset: delete confirmation — danger variant (red confirm,
// error icon) with translated irreversible-action wording.
// Pass onConfirm with the actual delete call.
//
// Nothing calls this preset here at the moment — kept as
// part of the modal's stock preset set.
// -----------------------------------------------------------

export function DeleteModal({
  title,
  description,
  confirmText,
  ...props
}) {

  const t = useTranslations("COMPONENTS.universalModal");

  return (
    <UniversalModal
      title={title ?? t("DELETE_MODAL.title")}
      description={description ?? t("DELETE_MODAL.description")}
      confirmText={confirmText ?? t("DELETE_MODAL.confirm")}
      variant="danger"
      {...props}
    />
  );
}







// -----------------------------------------------------------
// AlertModal
// -----------------------------------------------------------
//
// Preset: informational notice — info variant with a single
// translated "OK" button (cancel hidden by default since
// there is nothing to cancel).
//
// Nothing calls this preset here at the moment — kept as
// part of the modal's stock preset set.
// -----------------------------------------------------------

export function AlertModal({
  title,
  confirmText,
  showCancel = false,
  ...props
}) {

  const t = useTranslations("COMPONENTS.universalModal");

  return (
    <UniversalModal
      title={title ?? t("ALERT_MODAL.title")}
      confirmText={confirmText ?? t("ALERT_MODAL.confirm")}
      showCancel={showCancel}
      variant="info"
      {...props}
    />
  );
}







// -----------------------------------------------------------
// WarningModal
// -----------------------------------------------------------
//
// Preset: warning notice — warning variant, translated
// "Understood" confirm. Keeps the cancel button (unlike
// AlertModal) in case the caller wires onCancel to back out.
//
// Nothing calls this preset here at the moment — kept as
// part of the modal's stock preset set.
// -----------------------------------------------------------

export function WarningModal({
  title,
  confirmText,
  ...props
}) {

  const t = useTranslations("COMPONENTS.universalModal");

  return (
    <UniversalModal
      title={title ?? t("WARNING_MODAL.title")}
      confirmText={confirmText ?? t("WARNING_MODAL.confirm")}
      variant="warning"
      {...props}
    />
  );
}
