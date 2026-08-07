// -----------------------------------------------------------
//  [*] HomeRedirect — sends "/" to the user's home page
//
//  The SPA version of the old server-side index page: admins
//  land on /admin and everyone else on /vm. The AppShell
//  above already waited for the session (an invalid one
//  hard-redirects to /login before this renders), so the
//  decision is immediate.
//
//  Used by:
//    - router.jsx — the index route of "/"
// -----------------------------------------------------------

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/AuthGuard';







// -----------------------------------------------------------
// HomeRedirect (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — the index route of "/"
// -----------------------------------------------------------

export default function HomeRedirect() {
  const authdata = useAuth();

  return <Navigate to={authdata.admin === 1 ? '/admin' : '/vm'} replace />;
}
