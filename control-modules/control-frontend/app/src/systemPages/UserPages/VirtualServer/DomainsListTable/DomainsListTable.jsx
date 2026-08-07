// -----------------------------------------------------------
//  [*] DomainsListTable — domain names of one VM
//
//  The Domain Names tab of the VM page: a DataGrid of the
//  VM's domains (id, name, Cloudflare?, SSL?) — a TanStack
//  query on /api/vm/dns/<id>, invalidated on every save/
//  delete and dialog close. Clicking a row opens
//  AddEditDomain prefilled (the modal flies out of the
//  clicked row); the toolbar's Insert New opens it empty. A
//  401 bounces to /login.
//
//  Column headers and the toolbar label come from the
//  "PAGES.vmDetail" namespace; the toolbar is the shared
//  QuickSearchToolbar (this grid gained the quick search and
//  columns button with it); the grid's built-in texts are
//  themed through the DataGrid locale merge in providers.jsx
//  — no localeText prop here.
//
//  Split into (root component last):
//
//    DomainsListTable_Columns — column set built from t
//    DomainsListTable        — grid + dialog state (default
//                              export)
//
//  Used by:
//    - VirtualServer.jsx — the Domain Names tab
// -----------------------------------------------------------

import { DataGrid } from "@mui/x-data-grid";
import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from "axios";
import { Box, LinearProgress } from '@mui/material';
import { alpha } from '@mui/material/styles';

import { useTranslations } from '@/i18n';
import QuickSearchToolbar from '@/components/DatagridCustomComponents/QuickSearchToolbar';
import CustomPagination from '@/components/ButtonsPagination/ButtonsPagination';
import AddEditDomain from "./AddEditDomain/AddEditDomain";







// -----------------------------------------------------------
// DomainsListTable_Columns
// -----------------------------------------------------------
//
// Builds the column set with translated headers — a function
// (not a constant) because it needs t.
//
// Used by:
//   - DomainsListTable (below) — memoized on t
// -----------------------------------------------------------

function DomainsListTable_Columns(t) {
  return [
    {
      field: "id",
      headerName: t("DOMAINS_TABLE.id"),
      width: 70
    },
    {
      field: "domainname",
      headerName: t("DOMAINS_TABLE.domainname"),
      width: 350,
    },
    {
      field: "iscloudflare",
      headerName: t("DOMAINS_TABLE.cloudflare"),
      width: 120,
      renderCell: (params) => {
        return <div style={{textAlign: 'center'}}>{params.value == 1 ? t("DOMAINS_TABLE.yes") : t("DOMAINS_TABLE.no")}</div>
      }
    },
    {
      field: "ssl",
      headerName: t("DOMAINS_TABLE.ssl"),
      width: 120,
      renderCell: (params) => {
        return <div style={{textAlign: 'center'}}>{params.value == 1 ? t("DOMAINS_TABLE.yes") : t("DOMAINS_TABLE.no")}</div>
      }
    }
  ];
}







// -----------------------------------------------------------
// DomainsListTable (default export)
// -----------------------------------------------------------
//
// Used by:
//   - VirtualServer.jsx — the Domain Names tab
// -----------------------------------------------------------

export default function DomainsListTable({ virtualServerID }) {

  const t = useTranslations("PAGES.vmDetail");

  // Memoize columns so they don't reset on data refetch
  const columns = useMemo(() => DomainsListTable_Columns(t), [t]);

  const [openBackdrop, setOpenBackdrop] = useState(false);
  const queryClient = useQueryClient();

  // The VM's domain list; an auth failure bounces to /login
  // like every grid fetch did before
  const { data = [], isPending: loadingData, error } = useQuery({
    queryKey: ['vm-dns', virtualServerID],
    queryFn: async () => (await axios.get("/api/vm/dns/"+virtualServerID, { withCredentials: true })).data,
  });

  useEffect(() => {
    if (error?.response?.status === 401) {
      window.location.href = '/login';
    }
  }, [error]);

  // Handed to the dialog and run on every dialog close, so
  // saves and deletes show up immediately
  const getData = () =>
    queryClient.invalidateQueries({ queryKey: ['vm-dns', virtualServerID] });


  // A clicked row opens the dialog prefilled (flying out of
  // the row); Insert New opens it empty (flying out of the
  // button); any close refreshes the grid
  const [domainLineData, setDomainLineData] = useState();
  const [modalSourceRect, setModalSourceRect] = useState(null);

  const handleRowClick = (params, event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
    let modifiedParams = { ...params };
    setDomainLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = (event) => {
    setModalSourceRect(event?.currentTarget?.getBoundingClientRect() ?? null);
    setDomainLineData(undefined);
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
              addNewLabel: t("DOMAINS_TABLE.insert_new"),
              onAddNew: (event) => triggerAddNew(event)
            }
          }}
        />
      </Box>
      {openBackdrop?
        <AddEditDomain
          virtualServerID={virtualServerID}
          rowData={domainLineData}
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
