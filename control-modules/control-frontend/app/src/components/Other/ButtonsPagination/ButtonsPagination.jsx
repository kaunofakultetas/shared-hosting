// -----------------------------------------------------------
//  [*] ButtonsPagination — burgundy DataGrid pagination
//
//  A numbered MUI Pagination wired to the DataGrid api
//  context, selected page in the brand burgundy.
//
//  Carried over from the old app as-is. Note: both consumers
//  pass it as `slots={{ Pagination: ... }}` — DataGrid v7
//  slot keys are camelCase (`pagination`), so the capitalized
//  key is silently ignored and the grids actually render the
//  DEFAULT pagination. Kept byte-identical anyway: fixing the
//  key would change the visible behavior.
//
//  Used by:
//    - UsersListTable — the Pagination slot (see note)
//    - DomainsListTable — the Pagination slot (see note)
// -----------------------------------------------------------

import { gridPageCountSelector, gridPageSelector, useGridApiContext, useGridSelector } from "@mui/x-data-grid";
import Pagination from '@mui/material/Pagination';
import PaginationItem from '@mui/material/PaginationItem';







// -----------------------------------------------------------
// CustomPagination (default export)
// -----------------------------------------------------------
//
// Used by:
//   - UsersListTable / DomainsListTable — the Pagination slot
//     (currently inert — see the file header)
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
