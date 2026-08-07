// -----------------------------------------------------------
//  [*] AuthGuard — session state for the whole app
//
//  Checks the session once on app start, as a TanStack query:
//    GET /api/checkauth   (session cookie included)
//  and shares the result through React context:
//    - the context value is authdata itself — null until the
//      check finishes, then the user info from checkauth
//      ({ email, admin, ... })
//    - a failed check (no/expired session) hard-redirects the
//      whole page to /login, so pages below the provider can
//      assume a valid session. retry is off so an expired
//      session bounces immediately instead of after a retry
//      round.
//
//  This replaces the old Next.js server pages, which each
//  read the session cookie server-side and called
//  BACKEND_API_URL/api/checkauth before rendering. No polling
//  or refresh — a new login/logout becomes visible on the
//  next full page load.
// -----------------------------------------------------------

import { createContext, useContext, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';


const AuthContext = createContext(null);







// -----------------------------------------------------------
// useAuth
// -----------------------------------------------------------
//
// The session data (or null while the check is running).
//
// Used by:
//   - AppShell.jsx — gates the frame on the session
//   - PageWrapper.jsx — reads authdata for every routed page
//   - HomeRedirect.jsx — picks /admin or /vm by role
// -----------------------------------------------------------

export function useAuth() {
  return useContext(AuthContext);
}







// -----------------------------------------------------------
// AuthProvider
// -----------------------------------------------------------
//
// Used by:
//   - App.jsx — wraps every page except /login
// -----------------------------------------------------------

export function AuthProvider({ children }) {

  const { data: authdata = null, isError } = useQuery({
    queryKey: ['checkauth'],
    queryFn: async () => (await axios.get('/api/checkauth', { withCredentials: true })).data,
    staleTime: Infinity,
    retry: false,
  });

  // No valid session — restart at the login page
  useEffect(() => {
    if (isError) {
      window.location.href = '/login';
    }
  }, [isError]);

  return (
    <AuthContext.Provider value={authdata}>
      {children}
    </AuthContext.Provider>
  );
}
