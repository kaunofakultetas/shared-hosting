// -----------------------------------------------------------
//  [*] DataGrid custom components — QuickSearchToolbar
//
//  The shared DataGrid toolbar shell: an always-expanded
//  quick filter (input is trimmed before matching), the
//  ColumnsButton and — only when onAddNew is given — the
//  burgundy "add new" ToolbarButton. Page-specific extras
//  come in as children and render after the buttons, inside
//  the same Toolbar row.
//
//  Built on DataGrid v8's composable Toolbar/QuickFilter
//  components. The grids mounting it must also pass
//  showToolbar — in v8 the toolbar slot renders only when
//  that flag is set.
//
//  Props:
//    - placeholder  — quick filter placeholder text; when not
//                     given, the translated default is used
//                     ("Search..." / "Ieškoti...")
//    - ariaLabel    — aria-label for the quick filter input;
//                     left off the DOM when not given
//    - columnsLabel — ColumnsButton label; when not given the
//                     button keeps its own default
//    - addNewLabel  — label of the "add new" button
//    - onAddNew     — click handler of the "add new" button
//                     (receives the click event, so dialogs
//                     can fly out of it); the button renders
//                     only when this is set
//    - children     — page-specific toolbar extras
// -----------------------------------------------------------

import { Toolbar, QuickFilter, QuickFilterControl } from "@mui/x-data-grid";
import AddCircleOutlinedIcon from '@mui/icons-material/AddCircleOutlined';

import { useTranslations } from "@/i18n";
import ColumnsButton from '@/components/DatagridCustomComponents/ColumnsButton';
import ToolbarButton from '@/components/DatagridCustomComponents/ToolbarButton';







// -----------------------------------------------------------
// QuickSearchToolbar (default export)
// -----------------------------------------------------------
//
// label={columnsLabel} is passed even when undefined — the
// ColumnsButton then falls back to its own translated label,
// so callers without a custom label still get the stock one.
//
// Used by:
//   - UsersListTable — the toolbar slot (search + columns +
//     Insert New)
//   - DomainsListTable — the toolbar slot
// -----------------------------------------------------------

export default function QuickSearchToolbar({ placeholder, ariaLabel, columnsLabel, addNewLabel, onAddNew, children }) {

  const t = useTranslations("COMPONENTS.datagrid");

  return (
    <Toolbar sx={{ justifyContent: 'flex-start' }}>
      <QuickFilter
        expanded
        parser={(searchInput) => [searchInput.trim()]}
        formatter={(quickFilterValues) => quickFilterValues.join('')}
      >
        <QuickFilterControl placeholder={placeholder ?? t("searchPlaceholder")} size="small" aria-label={ariaLabel} />
      </QuickFilter>
      <ColumnsButton label={columnsLabel} />
      {onAddNew && <ToolbarButton label={addNewLabel} icon={AddCircleOutlinedIcon} onClick={onAddNew} />}
      {children}
    </Toolbar>
  );
}
