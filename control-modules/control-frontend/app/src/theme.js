// -----------------------------------------------------------
//  [*] MUI theme — CSS-variables based light theme
//
//  Single light color scheme. MUI emits every palette value
//  as a CSS custom property (--mui-*), so non-MUI styling
//  (Tailwind utilities via the @theme bridge in globals.css)
//  can reference the same colors — e.g.
//  var(--mui-palette-primary-main) for the brand burgundy.
//
//  Palette notes:
//    - primary.main — the brand burgundy rgb(123, 0, 63)
//      (THE color; always reference it through the theme or
//      the bridged Tailwind tokens, never hardcode)
//    - primary.dark — the hover pink; MUI contained buttons
//      pick it up as their hover background automatically,
//      which is what lets pages drop their per-button sx
//
//  MuiButton deliberately gets NO defaultProps variant
//  override: the DataGrid panels render internal variant-less
//  Buttons that would all turn into contained burgundy blobs.
//
//  The /login page renders OUTSIDE the ThemeProvider (see
//  App.jsx) and keeps its hardcoded colors.
//
//  Used by:
//    - App.jsx — passed to the ThemeProvider
// -----------------------------------------------------------

import { createTheme } from '@mui/material/styles';


export const themeOptions = {
  cssVariables: true,

  palette: {
    primary: {
      main: '#7B003F',
      dark: '#E64164', // Hover color
      contrastText: '#fff',
    },
  },
};

const theme = createTheme(themeOptions);

export default theme;
