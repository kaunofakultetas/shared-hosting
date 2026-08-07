// -----------------------------------------------------------
//  [*] Router — the app's route table
//
//  createBrowserRouter setup: every page is a child of the
//  App layout route ("/"), which adds the theme and auth
//  providers (App.jsx). Below it, the pathless AppShell
//  layout route holds the persistent Navbar/Sidebar/Footer
//  frame — pages render into its outlet through PageWrapper,
//  which injects authdata and — for the VM detail page — the
//  route param as a prop. The URL map matches the old Next.js
//  app 1:1:
//
//    /             — redirect by role (admin → /admin, → /vm)
//    /login        — login + registration (bare, no frame)
//    /vm           — the virtual servers list
//    /vm/:id       — one virtual server
//    /account      — account settings
//    /admin        — admin dashboard        (admin only)
//    /admin/users  — user administration    (admin only)
//
//  Used by:
//    - main.jsx — passed to RouterProvider
// -----------------------------------------------------------

import { createBrowserRouter } from 'react-router-dom';
import App from '@/App';
import AppShell from '@/AppShell';
import PageWrapper from '@/PageWrapper';
import HomeRedirect from '@/HomeRedirect';

// Login
import Login from '@/systemPages/Login/Login';

// User pages
import VirtualServers from '@/systemPages/UserPages/VirtualServers/VirtualServers';
import VirtualServer from '@/systemPages/UserPages/VirtualServer/VirtualServer';
import Account from '@/systemPages/UserPages/Account/Account';

// Admin pages
import Home from '@/systemPages/AdminPages/Home/Home';
import UsersList from '@/systemPages/AdminPages/UsersList/UsersList';


export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Login — rendered bare (App skips the providers)
      { path: 'login', element: <Login /> },

      // Everything else lives inside the persistent frame
      {
        element: <AppShell />,
        children: [
          // Home — redirect by role
          { index: true, element: <HomeRedirect /> },

          // User pages
          { path: 'vm', element: <PageWrapper component={VirtualServers} /> },
          { path: 'vm/:virtualServerID', element: <PageWrapper component={VirtualServer} paramName="virtualServerID" /> },
          { path: 'account', element: <PageWrapper component={Account} /> },

          // Admin pages
          { path: 'admin', element: <PageWrapper component={Home} adminOnly /> },
          { path: 'admin/users', element: <PageWrapper component={UsersList} adminOnly /> },
        ],
      },
    ],
  },
]);
