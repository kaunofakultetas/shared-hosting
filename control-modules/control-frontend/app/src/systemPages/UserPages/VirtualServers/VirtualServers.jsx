// -----------------------------------------------------------
//  [*] Virtual Servers — the server list page
//
//  The default landing page for regular users. The
//  Navbar/Sidebar/Footer frame comes from AppShell; this page
//  is just VirtualServersTable, which does all the real work
//  (cards, search, create/start/stop/delete).
//
//  Used by:
//    - router.jsx — route /vm (via PageWrapper)
// -----------------------------------------------------------

import VirtualServersTable from "./VirtualServersTable/VirtualServersTable"


// -----------------------------------------------------------
// VirtualServersPage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /vm (via PageWrapper)
// -----------------------------------------------------------

export default function VirtualServersPage({ authdata }) {
  return <VirtualServersTable authdata={authdata} />;
}
