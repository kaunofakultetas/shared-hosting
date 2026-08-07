// -----------------------------------------------------------
//  [*] Entry point — mounts the React app
//
//  Renders the router (route table in router.jsx, auth
//  provider in App.jsx) into the #root div of index.html.
//  Global styles (Tailwind + Inter font) are pulled in here.
// -----------------------------------------------------------

import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import '@/globals.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
);
