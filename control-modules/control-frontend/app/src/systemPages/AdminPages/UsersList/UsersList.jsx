// -----------------------------------------------------------
//  [*] Users List — the user administration page
//
//  Admin-only. The Navbar/Sidebar/Footer frame comes from
//  AppShell; this page is just UsersListTable, which holds
//  the grid and the add/edit dialog.
//
//  Used by:
//    - router.jsx — route /admin/users (via PageWrapper,
//      adminOnly)
// -----------------------------------------------------------

import UsersListTable from "./UsersListTable/UsersListTable"


// -----------------------------------------------------------
// UsersListPage (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /admin/users (via PageWrapper)
// -----------------------------------------------------------

export default function UsersListPage() {
  return <UsersListTable />;
}
