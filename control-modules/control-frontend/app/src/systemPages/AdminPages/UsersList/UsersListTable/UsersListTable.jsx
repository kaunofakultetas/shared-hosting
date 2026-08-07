// -----------------------------------------------------------
//  [*] UsersListTable — the users DataGrid
//
//  The /admin/users page body: a full-height grid of all
//  accounts (id, email, server count, admin and enabled
//  pills, last seen) — a TanStack query on /api/admin/users,
//  invalidated on every save/delete and dialog close.
//  Clicking a row opens AddEditUser prefilled (the modal
//  flies out of the clicked row); the toolbar's Insert New
//  opens it empty. The toolbar also has the comma-separated
//  quick search and the columns button. A 401 bounces to
//  /login.
//
//  Column headers and toolbar labels come from the
//  "PAGES.usersList" namespace; the grid's built-in texts
//  (column menu, filter panel, ...) are themed through the
//  DataGrid locale merge in providers.jsx — no localeText
//  prop here.
//
//  Split into (root component last):
//
//    QuickSearchToolbar    — search + columns + Insert New
//    StatusPill            — colored Yes/No, Enabled/Disabled
//    UsersListTable_Columns — column set built from t
//    UsersListTable        — grid + dialog state (default
//                            export)
//
//  Used by:
//    - UsersList.jsx — the /admin/users page body
// -----------------------------------------------------------

import { DataGrid, GridToolbarQuickFilter, GridToolbarColumnsButton } from "@mui/x-data-grid";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import { Box, Button, LinearProgress, Paper } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import { useTranslations } from '@/i18n';
import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditUser from "./AddEditUser/AddEditUser";







// -----------------------------------------------------------
// QuickSearchToolbar
// -----------------------------------------------------------
//
// The grid toolbar: quick search (splitting the input on
// commas into separate terms), the burgundy columns button
// and the Insert New button. Labels arrive through
// slotProps.toolbar; the add-new click passes its event up so
// the dialog can fly out of the button.
//
// Used by:
//   - UsersListTable (below) — the toolbar slot
// -----------------------------------------------------------

function QuickSearchToolbar({ placeholder, insertNewLabel, triggerAddNew }) {
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
        placeholder={placeholder}
      />
      {/* The columns button is a text button by default — this
          sx dresses it up as a contained-primary one; its
          label comes from the grid's locale texts */}
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
        onClick={(event) => { triggerAddNew(event) }}
        >
          <AddCircleOutlinedIcon style={{paddingRight: 8, fontSize: '22px'}}/>
          {insertNewLabel}
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
//   - UsersListTable_Columns (below) — the admin and enabled
//     columns
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
// UsersListTable_Columns
// -----------------------------------------------------------
//
// Builds the column set with translated headers — a function
// (not a constant) because it needs t.
//
// Used by:
//   - UsersListTable (below) — memoized on t
// -----------------------------------------------------------

function UsersListTable_Columns(t) {
  return [
    {
      field: "id",
      headerName: t("COLUMNS.id"),
      width: 70
    },
    {
      field: "email",
      headerName: t("COLUMNS.email"),
      width: 350,
    },
    {
      field: "servercount",
      headerName: t("COLUMNS.servers"),
      width: 100,
    },
    {
      field: "admin",
      headerName: t("COLUMNS.admin"),
      width: 100,

      // Admin ON is the alarming state — red, plain users green
      renderCell: (params) => {
        return (
          <StatusPill
            color={params.row.admin === 1 ? 'red' : 'green'}
            text={params.row.admin === 1 ? t("PILLS.yes") : t("PILLS.no")}
          />
        );
      },
    },
    {
      field: "enabled",
      headerName: t("COLUMNS.enabled"),
      width: 90,

      renderCell: (params) => {
        return (
          <StatusPill
            color={params.row.enabled === 1 ? 'green' : 'grey'}
            text={params.row.enabled === 1 ? t("PILLS.enabled") : t("PILLS.disabled")}
          />
        );
      },
    },
    {
      field: "lastseen",
      headerName: t("COLUMNS.lastseen"),
      width: 220,
    },
  ];
}







// -----------------------------------------------------------
// UsersListTable (default export)
// -----------------------------------------------------------
//
// Used by:
//   - UsersList.jsx — the /admin/users page body
// -----------------------------------------------------------

export default function UsersListTable() {

  const t = useTranslations("PAGES.usersList");

  // Memoize columns so they don't reset on data refetch
  const columns = useMemo(() => UsersListTable_Columns(t), [t]);

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


  // A clicked row opens the dialog prefilled (flying out of
  // the row); Insert New opens it empty (flying out of the
  // button); any close refreshes the grid
  const [userLineData, setUserLineData] = useState();
  const [modalSourceRect, setModalSourceRect] = useState(null);

  const handleRowClick = (params, event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
    let modifiedParams = { ...params };
    setUserLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = (event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
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
        {t("HEADER.title")}
        <DataGrid
          sx={{
            height: 'calc(100vh - 160px)',
            cursor:'pointer',
          }}
          rows={data}
          columns={columns}
          pageSizeOptions={[100]}
          rowHeight={30}
          onRowClick={handleRowClick}

          initialState={{
            columns: {
              columnVisibilityModel: {
              },
            },
            pagination: {
              paginationModel: { pageSize: 100 },
            },
          }}


          loading={loadingData}

          slots={{
            toolbar: QuickSearchToolbar,
            loadingOverlay: LinearProgress,
            pagination: CustomPagination,
          }}
          slotProps={{
            toolbar: {
              placeholder: t("HEADER.search_placeholder"),
              insertNewLabel: t("HEADER.insert_new"),
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
          sourceRect={modalSourceRect}
        />
      :
        <></>
      }
    </Paper>
  );
}
