// -----------------------------------------------------------
//  [*] BouncingDotsLoader — three bouncing white dots
//
//  Tiny inline wait indicator, fully self-contained: the
//  animation is an emotion keyframe and the dot styling lives
//  in the styled() root below (no CSS module). styled() needs
//  no ThemeProvider — it falls back to the default theme — so
//  this keeps working on the bare /login page.
//
//  Used by:
//    - Login — BrandSubmitButton's busy state
// -----------------------------------------------------------

import { styled, keyframes } from '@mui/material/styles';


// Each dot starts pushed 5px down and swings 5px up,
// alternating — the row oscillates around the baseline
const bounce = keyframes`
  to { transform: translateY(-5px); }
`;




// -----------------------------------------------------------
// Loader
// -----------------------------------------------------------
//
// The dot row: every child div is one white 5px dot on the
// shared bounce animation; the 2nd and 3rd start late so the
// dots ripple instead of jumping together.
//
// Used by:
//   - BouncingDotsLoader (below)
// -----------------------------------------------------------

const Loader = styled('div')({
  display: 'flex',
  justifyContent: 'center',
  marginLeft: 10,

  '& div': {
    width: 5,
    height: 5,
    margin: '1px 2px',
    borderRadius: '50%',
    backgroundColor: 'white',
    opacity: 1,
    animation: `${bounce} 0.6s infinite alternate`,
    transform: 'translateY(5px)',
  },
  '& div:nth-of-type(2)': {
    animationDelay: '0.2s',
  },
  '& div:nth-of-type(3)': {
    animationDelay: '0.3s',
  },
});




// -----------------------------------------------------------
// BouncingDotsLoader (default export)
// -----------------------------------------------------------
//
// Used by:
//   - Login — BrandSubmitButton's busy state
// -----------------------------------------------------------

export default function BouncingDotsLoader() {
  return (
    <Loader>
      <div></div>
      <div></div>
      <div></div>
    </Loader>
  );
}
