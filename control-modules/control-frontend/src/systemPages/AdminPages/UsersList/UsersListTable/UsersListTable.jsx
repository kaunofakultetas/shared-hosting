'use client';
import { DataGrid, GridToolbarQuickFilter, GridToolbarColumnsButton } from "@mui/x-data-grid";
import React, { useState, useEffect } from "react";
import axios from "axios";
import { Box, Button, LinearProgress, Paper } from '@mui/material';
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import CustomPagination from '@/components/Other/ButtonsPagination/ButtonsPagination';
import AddEditUser from "./AddEditUser/AddEditUser";

import { useTheme } from '@mui/material';







function QuickSearchToolbar({ triggerAddNew }) {
  const theme = useTheme();

  return (
    <>
      <Box
        sx={{
          p: 0.5,
          pb: 0,
        }}
      >
        <GridToolbarQuickFilter // style={{}}
          quickFilterParser={(searchInput) =>
            searchInput
              .split(',')
              .map((value) => value.trim())
              .filter((value) => value !== '')
          }
          placeholder="Ieškoti..."
        />
        <GridToolbarColumnsButton
          slotProps={{
            button:{
              sx: { 
                marginLeft: '10px',
                paddingLeft: '15px',
                paddingRight: '10px',
                color: 'white',
                backgroundColor: 'rgb(123, 0, 63)',
                "&:hover": {
                  backgroundColor: 'rgb(230, 65, 100)',
                },
              }
            }
          }}
        />

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
    </>
  );
}



const UsersListTable = () => {
  const [loadingData, setLoadingData] = useState(true);
  const [data, setData] = useState([]);
  const [openBackdrop, setOpenBackdrop] = useState(false);


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

      renderCell: (params) => {
        function selectColor(statusID){
          if(statusID === 0){        // Turned OFF
            return 'green';
          }
          else if(statusID === 1){   // Turned ON
            return 'red';
          }
        }
  
        function selectText(statusID){
          if(statusID === 0){        // Turned OFF
            return 'No';
          }
          else if(statusID === 1){   // Turned ON
            return 'Yes';
          }
        }
  

        return (
          <div 
            style={{
              backgroundColor: selectColor(params.row.admin), 
              padding: 0, 
              borderRadius: 9, 
              width: 80, 
              textAlign: 'center'
            }}
          >
            {selectText(params.row.admin)}
          </div>
        );
      },
    },
    {
      field: "enabled",
      headerName: "Enabled?",
      width: 90,

      renderCell: (params) => {
        function selectColor(statusID){
          if(statusID === 0){        // Turned OFF
            return 'grey';
          }
          else if(statusID === 1){   // Turned ON
            return 'green';
          }
        }
  
        function selectText(statusID){
          if(statusID === 0){        // Turned OFF
            return 'Disabled';
          }
          else if(statusID === 1){   // Turned ON
            return 'Enabled';
          }
        }
  

        return (
          <div 
            style={{
              backgroundColor: selectColor(params.row.enabled), 
              padding: 0, 
              borderRadius: 9, 
              width: 80, 
              textAlign: 'center'
            }}
          >
            {selectText(params.row.enabled)}
          </div>
        );
      },
    },
    {
      field: "lastseen",
      headerName: "Last Seen",
      width: 220,
    },
  ];







  async function getData() {
    try {
      const response = await axios.get("/api/admin/users", { withCredentials: true });
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
  const [userLineData, setUserLineData] = React.useState();

  const handleRowClick = (params) => {
    let modifiedParams = { ...params };
    setUserLineData(modifiedParams);
    setOpenBackdrop(true);
  };

  const triggerAddNew = () => {
    setUserLineData(undefined);
    setOpenBackdrop(true);
  }



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
        <AddEditUser 
          rowData={userLineData}
          setOpen={setOpenBackdrop} 
          getData={getData}
        /> 
      :
        <></> 
      }
    </Paper>
  );
};

export default UsersListTable;