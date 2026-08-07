// -----------------------------------------------------------
//  [*] Sidebar — left navigation
//
//  Shown on every signed-in page. Collapsible: the arrow
//  button at the top toggles between full rows (icon + label)
//  and an icon-only rail; the choice is remembered in
//  localStorage ("sidebarOpen") and re-read on mount.
//
//  Link groups (admin-only ones gated on authdata.admin):
//    - CONTROL     — Dashboard (admin), Virtual Servers
//    - INFORMATION — Documentation, Examples (new tab)
//    - ADMIN       — Users, Database, API Docs (admin only)
//    - ACCOUNT     — Account, Logout
//
//  The Logout row is just a client-side link to /login — the
//  login page drops the session cookie on mount. /docs,
//  /dbgate and /swagger are separate services behind the same
//  domain, not SPA routes, so they use plain <a> tags in a
//  new tab.
//
//  Split into (root component last):
//
//    ITEM_ROW_CLASSES    — the shared row styling
//    SectionTitle        — grey group heading ("-----" when
//                          collapsed)
//    SidebarLink         — internal row (react-router Link)
//    SidebarExternalLink — new-tab row (plain <a>)
//    AdminSidebar        — state + link list (default export)
//
//  Used by:
//    - VirtualServers / VirtualServer / Account — user pages
//    - Home / UsersList — admin pages
// -----------------------------------------------------------

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// Collapse/Expand Sidebar
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';

import DashboardIcon from "@mui/icons-material/Dashboard";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import StorageIcon from '@mui/icons-material/Storage';
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import ImportContactsIcon from '@mui/icons-material/ImportContacts';
import SettingsIcon from '@mui/icons-material/Settings';
import ExtensionIcon from '@mui/icons-material/Extension';
import ApiIcon from '@mui/icons-material/Api';


// One row in the link list — flex layout, grey hover pill
const ITEM_ROW_CLASSES = "flex items-center p-[3px] pl-[6px] pr-[10px] cursor-pointer whitespace-nowrap hover:bg-[#999] hover:rounded-[3px]";

// The icon inside a row — inline style so it beats the MUI
// SvgIcon default font-size regardless of CSS injection order
const ITEM_ICON_STYLE = { fontSize: 17, color: 'rgb(123, 0, 63)' };




// -----------------------------------------------------------
// SectionTitle
// -----------------------------------------------------------
//
// The small grey group heading; collapsed it turns into the
// "-----" divider so the groups stay visually separated.
//
// Used by:
//   - AdminSidebar (below)
// -----------------------------------------------------------

function SectionTitle({ open, children }) {
  return (
    <p className="text-[10px] font-bold text-[#999] mt-[15px] mb-[2px] whitespace-pre-wrap">
      {open ? children : '-----'}
    </p>
  );
}




// -----------------------------------------------------------
// SidebarLink
// -----------------------------------------------------------
//
// An internal navigation row: icon always, label only while
// the sidebar is open.
//
// Used by:
//   - AdminSidebar (below)
// -----------------------------------------------------------

function SidebarLink({ open, to, icon: Icon, label }) {
  return (
    <Link to={to} className="no-underline">
      <li className={ITEM_ROW_CLASSES}>
        <Icon style={ITEM_ICON_STYLE} />
        {open ? <span className="text-[13px] font-semibold text-[rgb(65,65,65)] ml-[10px]">{label}</span> : <></>}
      </li>
    </Link>
  );
}




// -----------------------------------------------------------
// SidebarExternalLink
// -----------------------------------------------------------
//
// A new-tab row for the non-SPA destinations (/docs, /dbgate,
// /swagger and the examples site) — a plain <a>, since these
// are separate services, not router pages.
//
// Used by:
//   - AdminSidebar (below)
// -----------------------------------------------------------

function SidebarExternalLink({ open, href, icon: Icon, label }) {
  return (
    <a href={href} className="no-underline" target="_blank" rel="noreferrer">
      <li className={ITEM_ROW_CLASSES}>
        <Icon style={ITEM_ICON_STYLE} />
        {open ? <span className="text-[13px] font-semibold text-[rgb(65,65,65)] ml-[10px]">{label}</span> : <></>}
      </li>
    </a>
  );
}




// -----------------------------------------------------------
// AdminSidebar (default export)
// -----------------------------------------------------------
//
// Holds the open/collapsed state (persisted in localStorage
// as "sidebarOpen") and renders the link groups. Starts open
// and syncs from localStorage after mount.
//
// Used by:
//   - VirtualServers / VirtualServer / Account / Home /
//     UsersList — next to the page content
// -----------------------------------------------------------

export default function AdminSidebar({ authdata }) {

  const [open, setopen] = useState(true);
  useEffect(() => {
    setopen(localStorage.getItem("sidebarOpen") !== "false");
  }, [])


  const toggleOpen = () => {
    var sidebarOpendNewValue = !open;
    setopen(sidebarOpendNewValue)
    localStorage.setItem('sidebarOpen', sidebarOpendNewValue);
  }


  return (
    <div className="bg-white border border-solid border-[lightgrey] transition-all duration-500 ease-in-out">
      <div className="px-[10px]">
        <ul className="list-none m-0 p-0">

          <button
            className="text-[#B2BAC2] bg-[rgb(123,0,63)] cursor-pointer mt-5 border-0 rounded-lg w-full"
            onClick={toggleOpen}
          >
            {open ? <KeyboardDoubleArrowLeftIcon style={{ verticalAlign: 'middle' }} /> : <KeyboardDoubleArrowRightIcon style={{ verticalAlign: 'middle' }} />}
          </button>


          {/* Control — pages every user has */}
          <SectionTitle open={open}>CONTROL</SectionTitle>
          {authdata.admin === 1 ?
            <SidebarLink open={open} to="/admin" icon={DashboardIcon} label="Dashboard" />
          :
            <></>
          }
          <SidebarLink open={open} to="/vm" icon={ViewInArIcon} label="Virtual Servers" />


          {/* Information — external help material */}
          <SectionTitle open={open}>INFORMATION</SectionTitle>
          <SidebarExternalLink open={open} href="/docs" icon={ImportContactsIcon} label="Documentation" />
          <SidebarExternalLink open={open} href="https://awesome-docker-compose.com/apps" icon={ExtensionIcon} label="Examples" />


          {/* Admin — management tools, admins only */}
          {authdata.admin === 1 ?
            <>
              <SectionTitle open={open}>ADMIN</SectionTitle>
              <SidebarLink open={open} to="/admin/users" icon={PersonOutlineIcon} label="Users" />
              <SidebarExternalLink open={open} href="/dbgate" icon={StorageIcon} label="Database" />
              <SidebarExternalLink open={open} href="/swagger" icon={ApiIcon} label="API Documentation" />
            </>
          :
            <></>
          }


          {/* Account */}
          <SectionTitle open={open}>ACCOUNT</SectionTitle>
          <SidebarLink open={open} to="/account" icon={SettingsIcon} label="Account" />
          <SidebarLink open={open} to="/login" icon={ExitToAppIcon} label="Logout" />

        </ul>
      </div>
    </div>
  );
}
