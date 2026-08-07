// -----------------------------------------------------------
//  [*] DomainsListTable — domain names of one VM
//
//  The Domain Names tab of the VM page: a DataGrid of the
//  VM's domains (id, name, Cloudflare?, SSL?) loaded from
//  /api/vm/dns/<id> — reloading whenever the dialog below
//  closes. Clicking a row opens AddEditDomain prefilled;
//  the toolbar's Insert New opens it empty. A 401 bounces
//  to /login.
//
//  Note: the LoadingOverlay/Pagination entries in `slots` are
//  capitalized, but DataGrid v7 slot keys are camelCase — the
//  grid actually renders its DEFAULT overlay and pagination.
//  Kept byte-identical from the old app on purpose.
//
//  Split into (root component last):
//
//    QuickSearchToolbar — just the burgundy Insert New button
//    DomainsListTable   — grid + dialog state (default export)
//
//  Used by:
//    - VirtualServer.jsx — the Domain Names tab
// -----------------------------------------------------------

import { DataGrid } from "@mui/x-data-grid";
import { useState, useEffect } from "react";
import axios from "axios";
import { Box, Button, LinearProgress } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditDomain from "./AddEditDomain/AddEditDomain";




// -----------------------------------------------------------
// QuickSearchToolbar
// -----------------------------------------------------------
//
// The grid toolbar — despite the name it only holds the
// Insert New button (no search field here, unlike the users
// list).
//
// Used by:
//   - DomainsListTable (below) — the toolbar slot
// -----------------------------------------------------------

function QuickSearchToolbar({ triggerAddNew }) {
  return (
    <Box sx={{ p: 0.5, pb: 0 }} >

      <Button
        variant="contained"
        sx={{
          marginLeft: '10px',
          paddingLeft: '15px',
          paddingRight: '10px',
          height: 30,
          backgroundColor: 'rgb(123, 0, 63)',
          "&:hover": {
            backgroundColor: 'rgb(230, 65, 100)',
          },
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
// DomainsListTable (default export)
// -----------------------------------------------------------
//
// Used by:
//   - VirtualServer.jsx — the Domain Names tab
// -----------------------------------------------------------

export default function DomainsListTable({ virtualServerID }) {

  const [loadingData, setLoadingData] = useState(true);
  const [data, setData] = useState([]);
  const [openBackdrop, setOpenBackdrop] = useState(false);


  const DomainsListTable_Columns = [
    {
      field: "id",
      headerName: "ID",
      width: 70
    },
    {
      field: "domainname",
      headerName: "Domain name",
      width: 350,
    },
    {
      field: "iscloudflare",
      headerName: "Is Cloudflare?",
      width: 120,
      renderCell: (params) => {
        return <div style={{textAlign: 'center'}}>{params.value == 1 ? 'Yes' : 'No'}</div>
      }
    },
    {
      field: "ssl",
      headerName: "Is SSL?",
      width: 120,
      renderCell: (params) => {
        return <div style={{textAlign: 'center'}}>{params.value == 1 ? 'Yes' : 'No'}</div>
      }
    }
  ];


  async function getData() {
    try {
      const response = await axios.get("/api/vm/dns/"+virtualServerID, { withCredentials: true });
      setData(response.data);
      setLoadingData(false);
    } catch (error) {
      if (error.response.status === 401) {
        window.location.href = '/login';
      }
    }
  }


  // Reload when the add/edit dialog closes
  useEffect(() => {
    getData();
  }, [openBackdrop]);


  // A clicked row opens the dialog prefilled; Insert New opens
  // it empty
  const [domainLineData, setDomainLineData] = useState();

  const handleRowClick = (params) => {
    let modifiedParams = { ...params };
    setDomainLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = () => {
    setDomainLineData(undefined);
    setOpenBackdrop(true);
  }


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
          columns={DomainsListTable_Columns}
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
        <AddEditDomain
          virtualServerID={virtualServerID}
          rowData={domainLineData}
          setOpen={setOpenBackdrop}
          getData={getData}
        />
      :
        <></>
      }
    </>
  );
}
