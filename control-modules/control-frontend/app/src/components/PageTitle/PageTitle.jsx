// -----------------------------------------------------------
//  [*] PageTitle — the standard page heading row
//
//  The grey 24px heading a page shows above its content. Also
//  a flex row with justify-between: put buttons or extras in
//  as siblings of the text and they land on the right edge.
//
//  Before this component the same row was hand-written on
//  every page in two dialects (Tailwind classes vs inline
//  styles) with drifting margins — this locks the look.
//
//  Used by:
//    - VirtualServersTable — title + the switch/search/new
//      controls on the right edge
//    - UsersListTable — the grid heading
//    - Account — the page heading
// -----------------------------------------------------------

export default function PageTitle({ children }) {
  return (
    <div className="w-full text-2xl text-gray-500 mb-2.5 flex items-center justify-between">
      {children}
    </div>
  );
}
