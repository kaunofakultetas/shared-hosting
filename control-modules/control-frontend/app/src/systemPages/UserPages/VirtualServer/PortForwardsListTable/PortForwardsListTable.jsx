// -----------------------------------------------------------
//  [*] PortForwardsListTable — public TCP ports of one VM
//
//  The Port Forwarding tab of the VM page: a DataGrid of the
//  VM's port forwards (id, public endpoint, server port,
//  description) — a TanStack query on /api/vm/portforward/<id>,
//  invalidated on every save/delete and dialog close. Clicking
//  a row opens AddEditPortForward prefilled (the modal flies
//  out of the clicked row); the toolbar's Insert New opens it
//  empty. A 401 bounces to /login.
//
//  The public endpoint cell renders host:port (the backend
//  sends the hostname next to every row) with a copy button —
//  the exact string students paste into their client tools.
//
//  Column headers and the toolbar label come from the
//  "PAGES.vmDetail" namespace; the toolbar is the shared
//  QuickSearchToolbar; the grid's built-in texts are themed
//  through the DataGrid locale merge in providers.jsx — no
//  localeText prop here.
//
//  Split into (root component last):
//
//    PortForwardsListTable_Columns — column set built from t
//    PortForwardsListTable         — grid + dialog state
//                                    (default export)
//
//  Used by:
//    - VirtualServer.jsx — the Port Forwarding tab
// -----------------------------------------------------------

import { DataGrid } from "@mui/x-data-grid";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import { Box, IconButton, LinearProgress, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import toast from "react-hot-toast";

import { useTranslations } from '@/i18n';
import QuickSearchToolbar from '@/components/DatagridCustomComponents/QuickSearchToolbar';
import CustomPagination from '@/components/ButtonsPagination/ButtonsPagination';
import AddEditPortForward from "./AddEditPortForward/AddEditPortForward";

import ContentCopyIcon from '@mui/icons-material/ContentCopy';







// -----------------------------------------------------------
// PortForwardsListTable_Columns
// -----------------------------------------------------------
//
// Builds the column set with translated headers — a function
// (not a constant) because it needs t. The public endpoint
// column sorts on the raw port number but renders host:port
// with the copy button (stopPropagation, so copying does not
// open the row's dialog).
//
// Used by:
//   - PortForwardsListTable (below) — memoized on t
// -----------------------------------------------------------

function PortForwardsListTable_Columns(t) {

  const copyEndpoint = (event, endpoint) => {
    event.stopPropagation();
    navigator.clipboard.writeText(endpoint);
    toast.success(<b>{t("PORTFORWARDS_TABLE.copied")}</b>, { duration: 2000 });
  };

  return [
    {
      field: "id",
      headerName: t("PORTFORWARDS_TABLE.id"),
      width: 70
    },
    {
      field: "publicport",
      headerName: t("PORTFORWARDS_TABLE.publicendpoint"),
      width: 260,
      renderCell: (params) => {
        const endpoint = `${params.row.publichost}:${params.row.publicport}`;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{endpoint}</span>
            <Tooltip title={t("PORTFORWARDS_TABLE.copy")}>
              <IconButton size="small" onClick={(event) => copyEndpoint(event, endpoint)}>
                <ContentCopyIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </div>
        );
      }
    },
    {
      field: "internalport",
      headerName: t("PORTFORWARDS_TABLE.internalport"),
      width: 140,
    },
    {
      field: "description",
      headerName: t("PORTFORWARDS_TABLE.description"),
      flex: 1,
      minWidth: 200,
    }
  ];
}







// -----------------------------------------------------------
// PortForwardsListTable (default export)
// -----------------------------------------------------------
//
// Used by:
//   - VirtualServer.jsx — the Port Forwarding tab
// -----------------------------------------------------------

export default function PortForwardsListTable({ virtualServerID }) {

  const t = useTranslations("PAGES.vmDetail");

  // Memoize columns so they don't reset on data refetch
  const columns = useMemo(() => PortForwardsListTable_Columns(t), [t]);

  const [openBackdrop, setOpenBackdrop] = useState(false);
  const queryClient = useQueryClient();

  // The VM's port forward list; an auth failure bounces to
  // /login like every grid fetch did before
  const { data = [], isPending: loadingData, error } = useQuery({
    queryKey: ['vm-portforwards', virtualServerID],
    queryFn: async () => (await axios.get("/api/vm/portforward/"+virtualServerID, { withCredentials: true })).data,
  });

  useEffect(() => {
    if (error?.response?.status === 401) {
      window.location.href = '/login';
    }
  }, [error]);

  // Handed to the dialog and run on every dialog close, so
  // saves and deletes show up immediately
  const getData = () =>
    queryClient.invalidateQueries({ queryKey: ['vm-portforwards', virtualServerID] });


  // A clicked row opens the dialog prefilled (flying out of
  // the row); Insert New opens it empty (flying out of the
  // button); any close refreshes the grid
  const [forwardLineData, setForwardLineData] = useState();
  const [modalSourceRect, setModalSourceRect] = useState(null);

  const handleRowClick = (params, event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
    let modifiedParams = { ...params };
    setForwardLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = (event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
    setForwardLineData(undefined);
    setOpenBackdrop(true);
  }

  const handleDialogOpen = (value) => {
    setOpenBackdrop(value);
    if (value === false) {
      getData();
    }
  };


  return (
    <>
      <Box
        sx={{
          fontSize: '24px',
          color: 'gray',
        }}
      >
        <DataGrid
          sx={{
            minHeight: '300px',
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
              addNewLabel: t("PORTFORWARDS_TABLE.insert_new"),
              onAddNew: (event) => triggerAddNew(event)
            }
          }}
        />
      </Box>
      {openBackdrop?
        <AddEditPortForward
          virtualServerID={virtualServerID}
          rowData={forwardLineData}
          setOpen={handleDialogOpen}
          getData={getData}
          sourceRect={modalSourceRect}
        />
      :
        <></>
      }
    </>
  );
}
