// -----------------------------------------------------------
//  [*] Virtual Servers — the server list page
//
//  The default landing page for regular users: the navbar/
//  sidebar frame around VirtualServersTable, which does all
//  the real work (cards, search, create/start/stop/delete).
//
//  Used by:
//    - router.jsx — route /vm (via PageWrapper)
// -----------------------------------------------------------

import { Toaster } from 'react-hot-toast';

import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar"
import VirtualServersTable from "./VirtualServersTable/VirtualServersTable"


// -----------------------------------------------------------
// VirtualServersPage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /vm (via PageWrapper)
// -----------------------------------------------------------

export default function VirtualServersPage({ authdata }) {
  return (
    <div>
      <Navbar authdata={authdata} />
      <Toaster />
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <Sidebar authdata={authdata} />
        <VirtualServersTable authdata={authdata} />
      </div>
      <div style={{ background: 'rgb(123, 0, 63)', height: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: "0.7em" }}>
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>

  )
}
