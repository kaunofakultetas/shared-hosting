// -----------------------------------------------------------
//  [*] Entry point — mounts the React app
//
//  Renders the router (route table in router.jsx, providers
//  in App.jsx, page shell in AppShell.jsx) into the #root div
//  of index.html, wrapped in StrictMode and the TanStack
//  Query provider — ONE QueryClient owns every backend fetch:
//  caching, the polling cadences (refetchInterval), and the
//  invalidations the action handlers fire after a change.
//  Global styles (Tailwind + Inter font) are pulled in here.
// -----------------------------------------------------------

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router';
import '@/globals.css';


// One client for the whole app. retry 1: a poll that fails
// twice in a row should surface its error state, not spin.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>
);
