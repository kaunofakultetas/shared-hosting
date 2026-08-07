// -----------------------------------------------------------
//  [*] PageWrapper — injects authdata and route params
//
//  Thin bridge between the route table and the pages: reads
//  the session from AuthGuard and renders the page with
//  authdata as a prop. The AppShell above already waits for
//  the auth check (skeleton until then), so authdata is
//  always non-null here and pages can dereference
//  authdata.admin without guards.
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







// -----------------------------------------------------------
// PageWrapper (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — wraps every page except /login
// -----------------------------------------------------------

export default function PageWrapper({ component: Component, paramName, adminOnly }) {
  const authdata = useAuth();
  const params = useParams();

  if (adminOnly && authdata.admin !== 1) {
    return <Navigate to="/" replace />;
  }

  return <Component authdata={authdata} {...(paramName ? { [paramName]: params[paramName] } : {})} />;
}
