'use client';
import { DataGrid, GridToolbarQuickFilter, GridToolbarColumnsButton } from "@mui/x-data-grid";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Box, Button, LinearProgress, Paper } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditDomain from "./AddEditDomain/AddEditDomain";

import { useTheme } from '@mui/material';







function QuickSearchToolbar({ triggerAddNew }) {
  const theme = useTheme();

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



const DomainsListTable = ({ virtualServerID }) => {
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



  useEffect(() => {
    getData();
  }, [openBackdrop]);




  // Edit or Add line
  const [domainLineData, setDomainLineData] = React.useState();

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
          // margin: 2,
        }}
      >
        <DataGrid
          sx={{
            height: 'calc(100vh - 620px)',
            minHeight: '300px',
            cursor:'pointer',
          }}
          rows={data}
          columns={DomainsListTable_Columns}
          pageSize={100}
          rowsPerPageOptions={[100]}
          rowHeight={30}
          onRowClick={handleRowClick}

          localeText={{
            // toolbarColumns: "STULPELIAI",
            // toolbarExport: "EXPORTUOTI"
          }}

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
};

export default DomainsListTable;