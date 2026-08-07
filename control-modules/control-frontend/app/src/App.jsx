// -----------------------------------------------------------
//  [*] App — the root layout route
//
//  Every page in router.jsx renders through its outlet,
//  wrapped in the style/theme stack and the AuthProvider (one
//  /api/checkauth query per full page load — AuthGuard.jsx).
//  The Navbar/Sidebar/Footer frame lives one level deeper, in
//  AppShell.jsx, so it mounts once and survives navigation.
//
//  StyledEngineProvider injectFirst puts the MUI (emotion)
//  styles BEFORE the Tailwind stylesheet in <head>, so
//  Tailwind utilities reliably override MUI defaults — and so
//  globals.css keeps the body font on Inter past CssBaseline.
//
//  Special case:
//    - /login renders the bare outlet: no theme (the page
//      styles itself with hardcoded colors — the --mui-*
//      variables don't exist there) and no auth check — a
//      failed check hard-redirects to /login, so running it
//      there would loop
// -----------------------------------------------------------

import { useLocation, useOutlet } from 'react-router-dom';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from '@/theme';
import { AuthProvider } from '@/AuthGuard';







// -----------------------------------------------------------
// App (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — element of the "/" layout route
// -----------------------------------------------------------

export default function App() {

  const { pathname } = useLocation();
  const outlet = useOutlet();

  // Login skips every provider (see the file header)
  if (pathname === '/login') {
    return outlet;
  }

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          {outlet}
        </AuthProvider>
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
