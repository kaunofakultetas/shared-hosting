// -----------------------------------------------------------
//  [*] AuthGuard — session state for the whole app
//
//  Checks the session once on app start:
//    GET /api/checkauth   (session cookie included)
//  and shares the result through React context:
//    - the context value is authdata itself — null until the
//      check finishes, then the user info from checkauth
//      ({ email, admin, ... })
//    - a failed check (no/expired session) hard-redirects the
//      whole page to /login, so pages below the provider can
//      assume a valid session
//
//  This replaces the old Next.js server pages, which each
//  read the session cookie server-side and called
//  BACKEND_API_URL/api/checkauth before rendering. No polling
//  or refresh — a new login/logout becomes visible on the
//  next full page load.
// -----------------------------------------------------------

import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';


const AuthContext = createContext(null);




// -----------------------------------------------------------
// useAuth
// -----------------------------------------------------------
//
// The session data (or null while the check is running).
//
// Used by:
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

  const [authdata, setAuthdata] = useState(null);

  useEffect(() => {
    axios.get('/api/checkauth', { withCredentials: true })
      .then((response) => setAuthdata(response.data))
      .catch(() => {
        // No valid session — restart at the login page
        window.location.href = '/login';
      });
  }, []);

  return (
    <AuthContext.Provider value={authdata}>
      {children}
    </AuthContext.Provider>
  );
}
