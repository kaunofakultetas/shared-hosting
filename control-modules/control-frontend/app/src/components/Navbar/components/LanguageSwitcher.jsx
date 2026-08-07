// -----------------------------------------------------------
//  [*] Navbar — LanguageSwitcher
//
//  Button that switches the UI locale via the i18n context's
//  setLocale — that writes the choice to the `locale` cookie
//  (so later visits keep it) and re-renders the app in the
//  new language, no page reload.
//
//  Styled like the navbar's Logout button (contained primary
//  with a white border), unlike the tracer original's Tahoma
//  look — our navbar buttons share one style.
// -----------------------------------------------------------

import { Button } from "@mui/material";
import { useSetLocale } from '@/i18n';







// -----------------------------------------------------------
// LanguageSwitcher (default export)
// -----------------------------------------------------------
//
// Used by:
//   - Navbar — renders one switcher for the "other" language
//     (shows "Lietuvių"/"English" depending on the current
//     locale)
// -----------------------------------------------------------

export default function LanguageSwitcher({ targetLocale, label }) {

  const setLocale = useSetLocale();

  return (
    <Button
      variant="contained"
      onClick={() => setLocale(targetLocale)}
      style={{ marginRight: '15px', border: '1px solid rgba(255, 255, 255, 1)' }}
      sx={{ textTransform: 'none' }}
    >
      {label}
    </Button>
  );
}
