// -----------------------------------------------------------
//  [*] UsersListTable — the users DataGrid
//
//  The /admin/users page body: a full-height grid of all
//  accounts (id, email, server count, admin and enabled
//  pills, last seen) — a TanStack query on /api/admin/users,
//  invalidated on every save/delete and dialog close.
//  Clicking a row opens AddEditUser prefilled; the toolbar's
//  Insert New opens it empty. The toolbar also has the
//  comma-separated quick search and the columns button. A 401
//  bounces to /login.
//
//  Note: the LoadingOverlay/Pagination entries in `slots` are
//  capitalized, but DataGrid v7 slot keys are camelCase — the
//  grid actually renders its DEFAULT overlay and pagination.
//  Kept byte-identical from the old app on purpose.
//
//  Split into (root component last):
//
//    QuickSearchToolbar — search + columns + Insert New
//    StatusPill         — colored Yes/No / Enabled/Disabled
//    UsersListTable     — grid + dialog state (default
//                         export)
//
//  Used by:
//    - UsersList.jsx — the /admin/users page body
// -----------------------------------------------------------

import { DataGrid, GridToolbarQuickFilter, GridToolbarColumnsButton } from "@mui/x-data-grid";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import { Box, Button, LinearProgress, Paper } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditUser from "./AddEditUser/AddEditUser";







// -----------------------------------------------------------
// QuickSearchToolbar
// -----------------------------------------------------------
//
// The grid toolbar: quick search (splitting the input on
// commas into separate terms), the burgundy columns button
// and the Insert New button.
//
// Used by:
//   - UsersListTable (below) — the toolbar slot
// -----------------------------------------------------------

function QuickSearchToolbar({ triggerAddNew }) {
  return (
    <Box
      sx={{
        p: 0.5,
        pb: 0,
      }}
    >
      <GridToolbarQuickFilter
        quickFilterParser={(searchInput) =>
          searchInput
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value !== '')
        }
        placeholder="Ieškoti..."
      />
      {/* The columns button is a text button by default — this
          sx dresses it up as a contained-primary one */}
      <GridToolbarColumnsButton
        slotProps={{
          button:{
            sx: {
              marginLeft: '10px',
              paddingLeft: '15px',
              paddingRight: '10px',
              color: 'white',
              backgroundColor: 'primary.main',
              "&:hover": {
                backgroundColor: 'primary.dark',
              },
            }
          }
        }}
      />

      {/* Insert New — contained-primary from the theme */}
      <Button
        variant="contained"
        sx={{
          marginLeft: '10px',
          paddingLeft: '15px',
          paddingRight: '10px',
          height: 30,
        }}
        onClick={() => { triggerAddNew() }}
        >
          <AddCircleOutlinedIcon style={{paddingRight: 8, fontSize: '22px'}}/>
          Insert New
      </Button>

    </Box>
  );
}







// -----------------------------------------------------------
// StatusPill
// -----------------------------------------------------------
//
// The colored pill of the Admin?/Enabled? cells — text and
// color resolved from the 0/1 flag by the column that renders
// it.
//
// Used by:
//   - UsersListTable (below) — the admin and enabled columns
// -----------------------------------------------------------

function StatusPill({ color, text }) {
  return (
    <div
      style={{
        backgroundColor: color,
        padding: 0,
        borderRadius: 9,
        width: 80,
        textAlign: 'center'
      }}
    >
      {text}
    </div>
  );
}







// -----------------------------------------------------------
// UsersListTable (default export)
// -----------------------------------------------------------
//
// Used by:
//   - UsersList.jsx — the /admin/users page body
// -----------------------------------------------------------

export default function UsersListTable() {

  const [openBackdrop, setOpenBackdrop] = useState(false);
  const queryClient = useQueryClient();

  // All accounts; an auth failure bounces to /login like every
  // grid fetch did before
  const { data = [], isPending: loadingData, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await axios.get("/api/admin/users", { withCredentials: true })).data,
  });

  useEffect(() => {
    if (error?.response?.status === 401) {
      window.location.href = '/login';
    }
  }, [error]);

  // Handed to the dialog and run on every dialog close, so
  // saves and deletes show up immediately
  const getData = () =>
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });


  const UsersListTable_Columns = [
    {
      field: "id",
      headerName: "ID",
      width: 70
    },
    {
      field: "email",
      headerName: "Email",
      width: 350,
    },
    {
      field: "servercount",
      headerName: "Servers",
      width: 100,
    },
    {
      field: "admin",
      headerName: "Admin?",
      width: 100,

      // Admin ON is the alarming state — red, plain users green
      renderCell: (params) => {
        return (
          <StatusPill
            color={params.row.admin === 1 ? 'red' : 'green'}
            text={params.row.admin === 1 ? 'Yes' : 'No'}
          />
        );
      },
    },
    {
      field: "enabled",
      headerName: "Enabled?",
      width: 90,

      renderCell: (params) => {
        return (
          <StatusPill
            color={params.row.enabled === 1 ? 'green' : 'grey'}
            text={params.row.enabled === 1 ? 'Enabled' : 'Disabled'}
          />
        );
      },
    },
    {
      field: "lastseen",
      headerName: "Last Seen",
      width: 220,
    },
  ];


  // A clicked row opens the dialog prefilled; Insert New opens
  // it empty; any close refreshes the grid
  const [userLineData, setUserLineData] = useState();

  const handleRowClick = (params) => {
    let modifiedParams = { ...params };
    setUserLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = () => {
    setUserLineData(undefined);
    setOpenBackdrop(true);
  }

  const handleDialogOpen = (value) => {
    setOpenBackdrop(value);
    if (value === false) {
      getData();
    }
  };


  return (
    <Paper sx={{ height: 'calc(100vh - 105px)', width: '100%', paddingRight: 4, overflow: 'hidden' }}>
      <Box
        sx={{
          fontSize: '24px',
          color: 'gray',
          margin: 2,
          width: '100%',
        }}
      >
        Users List
        <DataGrid
          sx={{
            height: 'calc(100vh - 160px)',
            cursor:'pointer',
          }}
          rows={data}
          columns={UsersListTable_Columns}
          pageSize={100}
          rowsPerPageOptions={[100]}
          rowHeight={30}
          onRowClick={handleRowClick}

          localeText={{}}

          initialState={{
            columns: {
              columnVisibilityModel: {
              },
            },
          }}


          loading={loadingData}

          slots={{
            toolbar: QuickSearchToolbar,
            LoadingOverlay: LinearProgress,
            Pagination: CustomPagination,
          }}
          slotProps={{
            toolbar: {
              triggerAddNew: triggerAddNew
            }
          }}
        />
      </Box>
      {openBackdrop?
        <AddEditUser
          rowData={userLineData}
          setOpen={handleDialogOpen}
          getData={getData}
        />
      :
        <></>
      }
    </Paper>
  );
}
