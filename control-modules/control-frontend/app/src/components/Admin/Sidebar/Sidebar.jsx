// -----------------------------------------------------------
//  [*] Sidebar — left navigation
//
//  Left navigation of the app, ported from the tracer system,
//  Zabbix-style: a narrow icon rail sits in the page layout;
//  moving the mouse over it expands the full panel OVER the
//  page content (the content does not reflow), and leaving
//  collapses it again after a short delay. The pin button at
//  the top docks the sidebar open instead — pinned, it takes
//  its full width in the layout like a classic sidebar. Both
//  states expand to the content-fit width, tracked
//  continuously by a ResizeObserver on an invisible ghost
//  copy of the labels (see useContentWidth); the pinned state
//  is remembered in localStorage ("sidebarOpen" — the same
//  key, so the old sidebar's saved choice carries over).
//
//  The links live in the SECTIONS table — one entry per
//  group, labels resolved from the "sidebar" translation
//  namespace. An `adminOnly` key on a section or item hides
//  it from regular users (authdata.admin), and the row
//  matching the current route is highlighted in the brand
//  tint.
//
//  Unlike the tracer original there is no keepalive re-sync
//  machinery here: AppShell mounts this component exactly
//  once, so state simply lives for the whole session.
//
//  Split into (root component last):
//
//    SECTIONS              — the declarative link table
//    clampWidth            — sanity bounds on the width
//    visibleSections       — SECTIONS minus admin-only rows
//    findActiveHref        — which row the current URL is
//    useSidebarPreferences — pinned persistence (guarded)
//    useHoverExpand        — fly-over hover state
//    useContentWidth       — ghost + ResizeObserver width
//    SectionTitle          — grey group heading
//    MenuItemContent       — icon + label (tooltip on rail)
//    MenuItem              — internal <Link> / external <a>
//    PinButton             — the dock/undock bar
//    SidebarLinks          — the table rendered as the list
//    Sidebar               — slot + panel (default export)
//
//  Used by:
//    - AppShell — mounted once next to the routed page
// -----------------------------------------------------------

import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';

import { useTranslations } from "@/i18n";

// Pin/unpin the sidebar
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';

// CONTROL
import DashboardIcon from "@mui/icons-material/Dashboard";
import ViewInArIcon from '@mui/icons-material/ViewInAr';

// INFORMATION
import ImportContactsIcon from '@mui/icons-material/ImportContacts';
import ExtensionIcon from '@mui/icons-material/Extension';

// ADMIN
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import StorageIcon from '@mui/icons-material/Storage';
import ApiIcon from '@mui/icons-material/Api';

// ACCOUNT
import SettingsIcon from '@mui/icons-material/Settings';
import ExitToAppIcon from "@mui/icons-material/ExitToApp";


// Sidebar widths (px). The expanded width is content-fit:
// the widest label (reported live by the ResizeObserver in
// useContentWidth) plus LABEL_SURROUND — everything around a
// label in a row: the wrapper's 2×10px padding, the 7.5px
// icon column offset, the 17px icon, the label's 10px margin,
// the row's 10px right padding and the 1px panel border.
// DEFAULT bridges the first frame before the observer fires;
// MIN/MAX are sanity bounds only.
const RAIL_WIDTH = 52;
const DEFAULT_EXPANDED_WIDTH = 210;
const MIN_EXPANDED_WIDTH = 140;
const MAX_EXPANDED_WIDTH = 400;
const LABEL_SURROUND = 20 + 7.5 + 17 + 10 + 10 + 1;

// How long the panel stays expanded after the mouse leaves —
// bridges small gaps so the panel doesn't flicker
const CLOSE_DELAY_MS = 200;







// -----------------------------------------------------------
// SECTIONS
// -----------------------------------------------------------
//
// The whole navigation as data: one entry per section, labels
// are keys into the "sidebar" translation namespace. Adding a
// link is a one-line edit here — no JSX involved.
//
// Entry fields:
//   - title      — section heading key
//   - adminOnly  — on a section or an item: only rendered for
//                  authdata.admin === 1
//   - items[]    — href, icon component, label key, and
//                  `external: true` for links that open in a
//                  new tab via a plain <a> (/docs, /dbgate
//                  and /swagger are separate services behind
//                  the same domain, not SPA routes)
//
// The Logout row is just a client-side link to /login — the
// login page drops the session cookie on mount.
//
// Used by:
//   - visibleSections (below) — filtered per user
// -----------------------------------------------------------

const SECTIONS = [
  {
    title: "CONTROL.TITLE",
    items: [
      { href: "/admin", icon: DashboardIcon, label: "CONTROL.dashboard", adminOnly: true },
      { href: "/vm", icon: ViewInArIcon, label: "CONTROL.virtual_servers" },
    ],
  },
  {
    title: "INFORMATION.TITLE",
    items: [
      { href: "/docs", icon: ImportContactsIcon, label: "INFORMATION.documentation", external: true },
      { href: "https://awesome-docker-compose.com/apps", icon: ExtensionIcon, label: "INFORMATION.examples", external: true },
    ],
  },
  {
    title: "ADMIN.TITLE",
    adminOnly: true,
    items: [
      { href: "/admin/users", icon: PersonOutlineIcon, label: "ADMIN.users" },
      { href: "/dbgate", icon: StorageIcon, label: "ADMIN.database", external: true },
      { href: "/swagger", icon: ApiIcon, label: "ADMIN.api_documentation", external: true },
    ],
  },
  {
    title: "ACCOUNT.TITLE",
    items: [
      { href: "/account", icon: SettingsIcon, label: "ACCOUNT.account" },
      { href: "/login", icon: ExitToAppIcon, label: "ACCOUNT.logout" },
    ],
  },
];







// -----------------------------------------------------------
// clampWidth
// -----------------------------------------------------------
//
// Sanity bounds on the expanded width — the value itself is
// always content-driven, this only guards the extremes.
//
// Used by:
//   - useContentWidth (below)
// -----------------------------------------------------------

const clampWidth = (width) =>
  Math.min(Math.max(width, MIN_EXPANDED_WIDTH), MAX_EXPANDED_WIDTH);







// -----------------------------------------------------------
// visibleSections
// -----------------------------------------------------------
//
// SECTIONS with the admin-only sections and items dropped for
// regular users. The ghost measurer uses the same filtered
// table, so a non-admin's sidebar is sized to the labels the
// user actually sees.
//
// Used by:
//   - Sidebar (below) — links, ghost and active-row lookup
// -----------------------------------------------------------

const visibleSections = (authdata) =>
  SECTIONS
    .filter((section) => !section.adminOnly || authdata?.admin === 1)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.adminOnly || authdata?.admin === 1),
    }));







// -----------------------------------------------------------
// findActiveHref
// -----------------------------------------------------------
//
// The href of the row the current URL belongs to: an internal
// link is active on its exact path and everything nested
// under it (/vm/5 lights up "Virtual Servers"). The LONGEST
// match wins, so /admin/users lights up "Users" and not the
// /admin Dashboard as well.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

const findActiveHref = (sections, pathname) => {
  let best = null;

  for (const section of sections) {
    for (const item of section.items) {
      if (item.external) continue;
      if (pathname === item.href || pathname.startsWith(item.href + '/')) {
        if (!best || item.href.length > best.length) {
          best = item.href;
        }
      }
    }
  }

  return best;
};







// -----------------------------------------------------------
// useSidebarPreferences
// -----------------------------------------------------------
//
// The persisted pinned (docked open) state. Storage access is
// try/catch-guarded — private browsing modes can throw on it,
// and the sidebar must still work (it just forgets the choice
// on reload).
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function useSidebarPreferences() {

  const [pinned, setPinned] = useState(() => {
    try {
      return localStorage.getItem("sidebarOpen") !== "false";
    } catch {
      return true;
    }
  });

  const togglePinned = () => {
    const newValue = !pinned;
    setPinned(newValue);
    try {
      localStorage.setItem('sidebarOpen', newValue);
    } catch { /* storage unavailable — the toggle still works */ }
  };

  return { pinned, togglePinned };
}







// -----------------------------------------------------------
// useHoverExpand
// -----------------------------------------------------------
//
// The fly-over hover state: entering the panel expands it
// immediately, leaving collapses it only after a short delay
// so briefly crossing the panel edge doesn't flicker it shut.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function useHoverExpand() {

  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef(null);

  const onMouseEnter = () => {
    clearTimeout(closeTimer.current);
    setHovered(true);
  };

  const onMouseLeave = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return { hovered, onMouseEnter, onMouseLeave };
}







// -----------------------------------------------------------
// useContentWidth
// -----------------------------------------------------------
//
// The content-fit expanded width, tracked continuously: a
// ResizeObserver watches the invisible ghost copy of the
// labels (rendered by the root at natural max-content width)
// and recalibrates whenever its size actually changes — new
// menu items, late-loading fonts. A ghost that isn't laid out
// yet reports ~0 — the previous value is kept.
//
// Used by:
//   - Sidebar (below)
// -----------------------------------------------------------

function useContentWidth(ghostRef) {

  const [expandedWidth, setExpandedWidth] = useState(DEFAULT_EXPANDED_WIDTH);

  useEffect(() => {
    const ghost = ghostRef.current;
    if (!ghost) return;

    const observer = new ResizeObserver((entries) => {
      const labelWidth = entries[0]?.contentRect?.width ?? 0;
      if (labelWidth < 30) return;
      setExpandedWidth(clampWidth(Math.ceil(labelWidth) + LABEL_SURROUND));
    });

    observer.observe(ghost);
    return () => observer.disconnect();
  }, [ghostRef]);

  return expandedWidth;
}







// -----------------------------------------------------------
// SectionTitle
// -----------------------------------------------------------
//
// Small grey heading above a group of links. When the sidebar
// is collapsed a real divider line replaces the title so the
// grouping stays visible. The row keeps the same height in
// both states so the links don't jump while the panel
// expands.
//
// Used by:
//   - SidebarLinks (below) — one per section
// -----------------------------------------------------------

function SectionTitle({ title, open }) {
  return (
    <div className="mt-[15px] mb-[2px] h-[15px] flex items-center">
      {open
        ? <p className="text-[10px] font-bold text-[#999] whitespace-pre-wrap m-0">{title}</p>
        : <Divider className="w-full" />
      }
    </div>
  );
}







// -----------------------------------------------------------
// MenuItemContent
// -----------------------------------------------------------
//
// Visual part of a sidebar link: icon + label. On the rail
// only the icon is visible and the label appears as a tooltip
// on hover (tooltip is manually controlled so it never shows
// in the expanded state). The active row — the page currently
// open — sits on a translucent brand tint with its label in
// the brand color.
//
// Used by:
//   - MenuItem (below) — wrapped in a <Link> or <a>
// -----------------------------------------------------------

function MenuItemContent({ icon: Icon, label, open, active }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Tooltip
      open={!open && hovered}
      title={label}
      placement="right"
      disableInteractive
      slotProps={{
        tooltip: { sx: { backgroundColor: '#000', fontSize: '15px' } },
      }}
    >
      <li
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setHovered(false)}
        // pl-[7.5px] centers the 17px icon on the 52px rail AND
        // fixes the expanded icon column at the same spot; the
        // fixed h-[23px] (17px icon + 2×3px py) keeps the row
        // the same height with and without the label, so rows
        // never shift down while the sidebar opens/closes
        className={`flex items-center h-[23px] py-[3px] pl-[7.5px] pr-[10px] cursor-pointer whitespace-nowrap rounded-[3px] hover:bg-[#999] transition-colors ${active ? 'bg-[rgba(var(--mui-palette-primary-mainChannel)/0.08)]' : ''}`}
      >
        <Icon style={{ fontSize: '17px', color: 'var(--mui-palette-primary-main)' }} />
        {/* Always in the DOM so the sidebar can measure its
            automatic width and the row height stays constant —
            invisible (not just clipped) on the rail, fading in
            as the panel expands; truncates with … if the text
            outgrows the panel */}
        <span className={`flex-1 min-w-0 overflow-hidden text-ellipsis text-[13px] leading-[17px] font-semibold ml-[10px] transition-opacity duration-300 ${active ? 'text-primary' : 'text-[rgb(65,65,65)]'} ${open ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
      </li>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// MenuItem
// -----------------------------------------------------------
//
// One sidebar link. Internal links use react-router's <Link>;
// external ones (docs, DbGate, swagger, examples) use a plain
// <a> opening in a new tab.
//
// Used by:
//   - SidebarLinks (below) — every visible item
// -----------------------------------------------------------

function MenuItem({ href, icon: Icon, label, open, active, external = false }) {
  if (external) {
    return (
      <a href={href} className="no-underline" target="_blank" rel="noopener noreferrer">
        <MenuItemContent icon={Icon} label={label} open={open} active={active} />
      </a>
    );
  }

  return (
    <Link to={href} className="no-underline">
      <MenuItemContent icon={Icon} label={label} open={open} active={active} />
    </Link>
  );
}







// -----------------------------------------------------------
// PinButton
// -----------------------------------------------------------
//
// The dock/undock bar at the top: a full-width burgundy strip
// that follows the sidebar's width, always visible (icon-only
// on the rail). Solid pin = docked, outlined = floating.
//
// Used by:
//   - Sidebar (below) — first row of the list
// -----------------------------------------------------------

function PinButton({ pinned, onToggle, t }) {
  return (
    <Tooltip
      title={pinned ? t("PIN.unpin") : t("PIN.pin")}
      placement="right"
      disableInteractive
      slotProps={{ tooltip: { sx: { backgroundColor: '#000', fontSize: '13px' } } }}
    >
      <button
        onClick={onToggle}
        className="w-full h-[30px] mt-3 flex items-center justify-center bg-primary hover:bg-primary-dark border-0 rounded-md cursor-pointer transition-colors"
      >
        {pinned
          ? <PushPinIcon style={{ fontSize: '18px', color: 'white' }} />
          : <PushPinOutlinedIcon style={{ fontSize: '18px', color: 'rgba(255,255,255,0.85)' }} />
        }
      </button>
    </Tooltip>
  );
}







// -----------------------------------------------------------
// SidebarLinks
// -----------------------------------------------------------
//
// The filtered section table rendered as the link list: a
// heading per section and a MenuItem per item, the active row
// marked.
//
// Used by:
//   - Sidebar (below) — inside the panel
// -----------------------------------------------------------

function SidebarLinks({ sections, open, activeHref, t }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.title}>
          <SectionTitle title={t(section.title)} open={open} />
          {section.items.map((item) => (
            <MenuItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.label)}
              open={open}
              active={item.href === activeHref}
              external={item.external}
            />
          ))}
        </div>
      ))}
    </>
  );
}







// -----------------------------------------------------------
// Sidebar (default export)
// -----------------------------------------------------------
//
// Two nested boxes: the SLOT participates in the page flex
// layout (rail width, or the expanded width when pinned) and
// the PANEL is absolutely positioned inside it, so a hover
// expansion grows the panel over the page content without
// reflowing it. Both pinned and fly-over expand to the
// automatic content-fit width.
//
// Used by:
//   - AppShell — mounted once next to the routed page
// -----------------------------------------------------------

export default function Sidebar({ authdata }) {

  const t = useTranslations("sidebar");

  const { pathname } = useLocation();
  const ghostRef = useRef(null);

  const { hovered, onMouseEnter, onMouseLeave } = useHoverExpand();
  const { pinned, togglePinned } = useSidebarPreferences();
  const expandedWidth = useContentWidth(ghostRef);

  const sections = visibleSections(authdata);
  const activeHref = findActiveHref(sections, pathname);


  const open = pinned || hovered;
  const overlaying = open && !pinned;

  return (
    // The slot — holds layout space: just the rail, or the
    // full width when the sidebar is pinned
    <div
      className="relative shrink-0 transition-[width] duration-300 ease-in-out"
      style={{ width: pinned ? expandedWidth : RAIL_WIDTH }}
    >
      {/* The panel — flies over the content when hover-expanded */}
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`absolute inset-y-0 left-0 z-40 border-r border-edge bg-white overflow-y-auto overflow-x-hidden transition-[width,box-shadow] duration-300 ease-in-out ${overlaying ? 'shadow-[4px_0_20px_rgba(0,0,0,0.25)]' : ''}`}
        style={{ width: open ? expandedWidth : RAIL_WIDTH }}
      >
        {/* Ghost measurer — an invisible, zero-height copy of
            every visible label at natural width, watched by the
            ResizeObserver in useContentWidth. Same typography
            classes as the real labels so it measures true. */}
        <div ref={ghostRef} aria-hidden="true" className="absolute invisible h-0 overflow-hidden w-max whitespace-nowrap text-[13px] font-semibold">
          {sections.flatMap((section) => section.items).map((item) => (
            <div key={item.href}>{t(item.label)}</div>
          ))}
        </div>

        <div className="px-[10px]">
          <ul className="list-none m-0 p-0">
            <PinButton pinned={pinned} onToggle={togglePinned} t={t} />
            <SidebarLinks sections={sections} open={open} activeHref={activeHref} t={t} />
          </ul>
        </div>
      </div>
    </div>
  );
}
