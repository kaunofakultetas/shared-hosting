// -----------------------------------------------------------
//  [*] ButtonsPagination — burgundy DataGrid pagination
//
//  A numbered MUI Pagination wired to the DataGrid api
//  context, selected page in the brand burgundy.
//
//  Used by:
//    - UsersListTable — the pagination slot
//    - DomainsListTable — the pagination slot
// -----------------------------------------------------------

import { gridPageCountSelector, gridPageSelector, useGridApiContext, useGridSelector } from "@mui/x-data-grid";
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';







// -----------------------------------------------------------
// CustomPagination (default export)
// -----------------------------------------------------------
//
// Used by:
//   - UsersListTable / DomainsListTable — the pagination slot
// -----------------------------------------------------------

export default function CustomPagination() {
    const apiRef = useGridApiContext();
    const page = useGridSelector(apiRef, gridPageSelector);
    const pageCount = useGridSelector(apiRef, gridPageCountSelector);

    return (
      <Pagination
        boundaryCount={4}
        showFirstButton
        showLastButton
        variant="outlined"
        shape="rounded"
        page={page + 1}
        count={pageCount}
        renderItem={(props2) => <PaginationItem {...props2} disableRipple />}
        onChange={(event, value) => apiRef.current.setPage(value - 1)}
        sx={{
          '& .MuiPaginationItem-root': {
            '&.Mui-selected': {
              background: 'var(--mui-palette-primary-main)',
              color: 'white',
              "&:hover": {
                backgroundColor: 'primary.dark',
              },
            },
            "&:hover": {
              backgroundColor: 'primary.dark',
            },
          },
        }}
      />
    );
}
