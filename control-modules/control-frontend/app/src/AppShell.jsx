// -----------------------------------------------------------
//  [*] AppShell — the persistent page frame
//
//  Navbar on top, Sidebar on the left, the routed page in
//  between, Footer at the bottom, plus the single app-wide
//  toast outlet. Mounted ONCE as a pathless layout route
//  (router.jsx), so navigating between pages swaps only the
//  page content — the frame (and the sidebar's open state)
//  never remounts.
//
//  While the auth check is in flight the shell renders as a
//  full-page skeleton instead of a blank screen; pages below
//  therefore always receive a non-null authdata.
//
//  Split into (root component last):
//
//    Footer      — the burgundy copyright bar
//    AppSkeleton — the frame as grey bones while auth loads
//    AppShell    — frame + outlet (default export)
// -----------------------------------------------------------

import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Skeleton from '@mui/material/Skeleton';

import { useAuth } from '@/AuthGuard';
import Navbar from '@/components/Navbar/Navbar';
import Sidebar from '@/components/Admin/Sidebar/Sidebar';








// -----------------------------------------------------------
// Footer
// -----------------------------------------------------------
//
// The one copyright bar of the app — the pages used to carry
// three slightly different copies each.
//
// Used by:
//   - AppShell, AppSkeleton (below)
// -----------------------------------------------------------

function Footer() {
  return (
    <footer className="bg-primary h-[30px] w-full flex items-center justify-center text-white text-[0.7em]">
      Copyright © | All Rights Reserved | VUKnF
    </footer>
  );
}








// -----------------------------------------------------------
// AppSkeleton
// -----------------------------------------------------------
//
// The frame as grey bones: the solid navbar and footer bars
// with a sidebar rail and content blocks skeletoned between
// them — same heights as the real frame, so the page doesn't
// jump when the data arrives.
//
// Used by:
//   - AppShell (below) — while /api/checkauth is in flight
// -----------------------------------------------------------

function AppSkeleton() {
  return (
    <>
      <div className="h-[75px] bg-primary" />

      <div className="flex">
        {/* Sidebar bone — the width matches the sidebar's
            DEFAULT_EXPANDED_WIDTH so the frame barely moves
            when the real (pinned) sidebar takes over */}
        <div className="w-[210px] shrink-0 bg-white border-r border-edge px-[10px] pt-5">
          <Skeleton variant="rounded" height={24} />
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} variant="text" height={28} sx={{ mt: 1 }} />
          ))}
        </div>

        {/* Page area */}
        <div className="flex-1 bg-gray-100 p-6 h-[calc(100vh-105px)]">
          <Skeleton variant="text" height={40} width="30%" />
          <Skeleton variant="rounded" height={100} sx={{ mt: 2 }} />
          <Skeleton variant="rounded" height={240} sx={{ mt: 2 }} />
        </div>
      </div>

      <Footer />
    </>
  );
}








// -----------------------------------------------------------
// AppShell (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — pathless layout route around every page
//     except /login
// -----------------------------------------------------------

export default function AppShell() {

  const authdata = useAuth();

  // Auth check still in flight — the AuthProvider either fills
  // authdata or hard-redirects to /login
  if (authdata === null) {
    return <AppSkeleton />;
  }

  return (
    <>
      <Toaster position="top-center" />
      <Navbar authdata={authdata} />

      <div className="flex">
        <Sidebar authdata={authdata} />
        <Outlet />
      </div>

      <Footer />
    </>
  );
}
