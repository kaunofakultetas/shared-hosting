// -----------------------------------------------------------
//  [*] App — the root layout route
//
//  Every page in router.jsx renders through its outlet,
//  wrapped in the AuthProvider (one /api/checkauth call per
//  full page load — see AuthGuard.jsx). There is no MUI
//  ThemeProvider and no page keep-alive on purpose: the old
//  Next.js app had neither, every page styles itself with
//  hardcoded colors and remounts fresh on navigation, and the
//  polling pages (VM lists, dashboard widgets) rely on that
//  remount to stop their intervals when the user leaves.
//
//  Special case:
//    - /login renders the bare outlet with no auth check —
//      a failed check hard-redirects to /login, so running
//      it there would loop
// -----------------------------------------------------------

import { useLocation, useOutlet } from 'react-router-dom';
import { AuthProvider } from '@/AuthGuard';


export default function App() {

  const { pathname } = useLocation();
  const outlet = useOutlet();

  // Login skips the auth provider (see the file header)
  if (pathname === '/login') {
    return outlet;
  }

  return (
    <AuthProvider>
      {outlet}
    </AuthProvider>
  );
}
