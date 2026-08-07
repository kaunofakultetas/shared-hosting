// -----------------------------------------------------------
//  [*] Users List — the user administration page
//
//  Admin-only: the navbar/sidebar frame around
//  UsersListTable, which holds the grid and the add/edit
//  dialog.
//
//  Used by:
//    - router.jsx — route /admin/users (via PageWrapper,
//      adminOnly)
// -----------------------------------------------------------

import { Toaster } from 'react-hot-toast';

import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar"
import UsersListTable from "./UsersListTable/UsersListTable"


// -----------------------------------------------------------
// UsersListPage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /admin/users (via PageWrapper)
// -----------------------------------------------------------

export default function UsersListPage({ authdata }) {
  return (
    <div>
      <Navbar authdata={authdata} />
      <Toaster />
      <div style={{ display: 'flex', flexDirection: 'row' }}>
        <Sidebar authdata={authdata} />
        <UsersListTable />
      </div>
      <div style={{ background: 'rgb(123, 0, 63)', height: 30, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: "0.7em" }}>
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>

  )
}
