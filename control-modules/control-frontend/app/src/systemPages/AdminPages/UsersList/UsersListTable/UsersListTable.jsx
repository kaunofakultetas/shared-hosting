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
//  "PAGES.usersList" namespace; the toolbar is the shared
//  QuickSearchToolbar, configured through slotProps.toolbar;
//  the grid's built-in texts (column menu, filter panel, ...)
//  are themed through the DataGrid locale merge in
//  providers.jsx — no localeText prop here.
//
//  Split into (root component last):
//
//    StatusPill            — colored Yes/No, Enabled/Disabled
//    UsersListTable_Columns — column set built from t
//    UsersListTable        — grid + dialog state (default
//                            export)
//
//  Used by:
//    - UsersList.jsx — the /admin/users page body
// -----------------------------------------------------------

import { DataGrid } from "@mui/x-data-grid";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import { Box, LinearProgress, Paper } from '@mui/material';
import { alpha } from '@mui/material/styles';

import { useTranslations } from '@/i18n';
import QuickSearchToolbar from '@/components/DatagridCustomComponents/QuickSearchToolbar';
import CustomPagination from '@/components/ButtonsPagination/ButtonsPagination';
import PageTitle from '@/components/PageTitle/PageTitle';
import AddEditUser from "./AddEditUser/AddEditUser";







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
          margin: 2,
          width: '100%',
        }}
      >
        <PageTitle>{t("HEADER.title")}</PageTitle>
        <DataGrid
          sx={{
            height: 'calc(100vh - 160px)',
            cursor:'pointer',
            '& .MuiDataGrid-row:hover': {
              backgroundColor: (theme) => alpha(theme.palette.primary.main, 0.08),
            },
          }}
          rows={data}
          columns={columns}
          pageSizeOptions={[100]}
          rowHeight={30}
          onRowClick={handleRowClick}
          showToolbar

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
              addNewLabel: t("HEADER.insert_new"),
              onAddNew: (event) => triggerAddNew(event)
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
