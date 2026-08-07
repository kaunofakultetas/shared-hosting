// -----------------------------------------------------------
//  [*] PageWrapper — injects authdata and route params
//
//  Thin bridge between the route table and the pages: reads
//  the session from AuthGuard and renders the page with
//  authdata as a prop. Nothing renders until the auth check
//  answers (the old server pages behaved the same way — the
//  browser saw nothing until checkauth resolved), so pages
//  can dereference authdata.admin without guards.
//
//  When the route declares paramName, the matching URL param
//  is passed through as a prop of that name too (e.g.
//  paramName="virtualServerID" — the VirtualServer page gets
//  virtualServerID={...}).
//
//  adminOnly routes replicate the old server-side gate: a
//  signed-in non-admin is bounced to "/" (which then lands
//  them on /vm).
//
//  Used by:
//    - router.jsx — wraps every page except /login
// -----------------------------------------------------------

import { useParams, Navigate } from 'react-router-dom';
import { useAuth } from '@/AuthGuard';


export default function PageWrapper({ component: Component, paramName, adminOnly }) {
  const authdata = useAuth();
  const params = useParams();

  // Auth check still in flight — the AuthProvider either fills
  // authdata or hard-redirects to /login
  if (authdata === null) {
    return null;
  }

  if (adminOnly && authdata.admin !== 1) {
    return <Navigate to="/" replace />;
  }

  return <Component authdata={authdata} {...(paramName ? { [paramName]: params[paramName] } : {})} />;
}
