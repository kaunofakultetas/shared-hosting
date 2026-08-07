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
//  "PAGES.vmDetail" namespace; the grid's built-in texts are
//  themed through the DataGrid locale merge in providers.jsx
//  — no localeText prop here.
//
//  Split into (root component last):
//
//    QuickSearchToolbar      — just the Insert New button
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
import { Box, Button, LinearProgress } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import { useTranslations } from '@/i18n';
import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditDomain from "./AddEditDomain/AddEditDomain";







// -----------------------------------------------------------
// QuickSearchToolbar
// -----------------------------------------------------------
//
// The grid toolbar — despite the name it only holds the
// Insert New button (no search field here, unlike the users
// list). The click passes its event up so the dialog can fly
// out of the button.
//
// Used by:
//   - DomainsListTable (below) — the toolbar slot
// -----------------------------------------------------------

function QuickSearchToolbar({ insertNewLabel, triggerAddNew }) {
  return (
    <Box sx={{ p: 0.5, pb: 0 }} >

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
              insertNewLabel: t("DOMAINS_TABLE.insert_new"),
              triggerAddNew: triggerAddNew
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
