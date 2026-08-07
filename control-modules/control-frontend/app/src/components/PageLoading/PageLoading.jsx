// -----------------------------------------------------------
//  [*] PageLoading — the standard "content is loading" filler
//
//  Centered spinner (+ optional label) that takes the place
//  of a page or panel while its data loads — one look for
//  every blocking load in the app. Pages that can show their
//  real layout early use inline Skeletons instead (the VM
//  list and detail pages, the activity lists).
//
//  The label comes in already translated from the caller
//  (same pattern as QuickSearchToolbar): pass t("LOADING"),
//  or leave it off for just the spinner.
//
//  Nothing calls this here at the moment — today's blocking
//  loads are all covered by skeletons. Kept ready for the
//  next panel that has no layout to skeleton.
// -----------------------------------------------------------

import CircularProgress from '@mui/material/CircularProgress';







// -----------------------------------------------------------
// PageLoading (default export)
// -----------------------------------------------------------
//
// Used by:
//   - nothing yet — see the file header
// -----------------------------------------------------------

export default function PageLoading({ label }) {
  return (
    <div className="flex-1 h-full min-h-[200px] flex flex-col items-center justify-center gap-3 p-5">
      <CircularProgress />
      {label && <div className="text-gray-500 text-sm">{label}</div>}
    </div>
  );
}
