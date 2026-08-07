// -----------------------------------------------------------
//  [*] HomeRedirect — sends "/" to the user's home page
//
//  The SPA version of the old server-side index page: once
//  the session is known, admins land on /admin and everyone
//  else on /vm. An invalid session never reaches this point —
//  the AuthProvider hard-redirects to /login first.
//
//  Used by:
//    - router.jsx — the index route of "/"
// -----------------------------------------------------------

import { Navigate } from 'react-router-dom';
import { useAuth } from '@/AuthGuard';


export default function HomeRedirect() {
  const authdata = useAuth();

  // Auth check still in flight
  if (authdata === null) {
    return null;
  }

  return <Navigate to={authdata.admin === 1 ? '/admin' : '/vm'} replace />;
}
