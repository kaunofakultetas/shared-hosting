// -----------------------------------------------------------
//  [*] DataGrid custom components — ToolbarButton
//
//  Generic action button for DataGrid toolbars: small
//  contained burgundy button with an optional icon and a
//  label, wired to whatever onClick the caller provides.
//  Unlike ColumnsButton it has no grid logic of its own, so
//  it works anywhere.
// -----------------------------------------------------------

import { Button } from '@mui/material';







// -----------------------------------------------------------
// ToolbarButton (default export)
// -----------------------------------------------------------
//
// Used by:
//   - QuickSearchToolbar (the "add new" button of the
//     editable grids — UsersListTable, DomainsListTable)
// -----------------------------------------------------------

export default function ToolbarButton({ onClick, label, icon: Icon }) {
  return (
    <Button
      variant="contained"
      sx={{
        marginLeft: '10px',
        paddingLeft: '15px',
        paddingRight: '15px',
        height: 30,
        backgroundColor: 'primary.main',
        "&:hover": {
          backgroundColor: 'primary.dark',
        },
      }}
      onClick={onClick}
    >
      {Icon && <Icon style={{ paddingRight: 8, fontSize: '22px' }} />}
      {label}
    </Button>
  );
}
