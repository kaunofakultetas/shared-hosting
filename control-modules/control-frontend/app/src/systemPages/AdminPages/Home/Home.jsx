// -----------------------------------------------------------
//  [*] Admin Home — the dashboard
//
//  The admin landing page: a top row of stat cards (Users,
//  Virtual Servers running/total, Domain Names, Quick
//  Registration) over the System Overview gauges and the
//  Recent Activity feed. The counts come from
//  /api/dashboard/hostingsystem, polled every 2 seconds by
//  TanStack Query; every value shows an em-dash until the
//  first answer arrives. The Navbar/Sidebar/Footer frame
//  comes from AppShell.
//
//  Used by:
//    - router.jsx — route /admin (via PageWrapper, adminOnly)
// -----------------------------------------------------------

import { useQuery } from '@tanstack/react-query';
import axios from "axios";

import Widget from "./components/Widget/Widget";
import QuickRegistrationWidget from "./components/QuickRegistrationWidget/QuickRegistrationWidget";
import SystemOverviewWidget from "./components/SystemOverviewWidget/SystemOverviewWidget";
import RecentActivityWidget from "./components/RecentActivityWidget/RecentActivityWidget";

import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';


// -----------------------------------------------------------
// Home (default export)
// -----------------------------------------------------------
//
// Used by:
//   - router.jsx — route /admin (via PageWrapper, adminOnly)
// -----------------------------------------------------------

export default function Home() {

  // Hosting system counts, polled every 2 seconds
  const { data: hostingStats = {
    users: 0,
    virtualservers_running: 0,
    virtualservers_total: 0,
    domains: 0,
  }, isPending } = useQuery({
    queryKey: ['dashboard-hostingsystem'],
    queryFn: async () => (await axios.get('/api/dashboard/hostingsystem', { withCredentials: true })).data,
    refetchInterval: 2000,
  });


  // Helper for consistent icon styling
  const getIcon = (IconComponent, color = "#7451f8", bgColor = "rgba(116, 81, 248, 0.2)") => {
    return (
      <IconComponent
        className="text-lg p-1 rounded self-end"
        style={{ color, backgroundColor: bgColor }}
      />
    );
  };

  // Format value: show "—" while loading and value is 0,
  // otherwise show actual value
  const formatValue = (value) => {
    if (isPending && (value === 0 || value === null || value === undefined)) return '—';
    return value;
  };


  return (
    <div className="grow-[6] bg-gray-100 p-5" style={{ height: "calc(100vh - 105px)", overflowY: "auto" }}>

      {/* Top Widgets - 4 items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-5">

        <Widget
          text="Users"
          count={formatValue(hostingStats.users)}
          icon={getIcon(PeopleOutlinedIcon, "crimson", "rgba(255, 0, 0, 0.2)")}
          link="/admin/users"
        />

        <Widget
          text="Virtual Servers"
          count={formatValue(hostingStats.virtualservers_running)}
          countSecondary={formatValue(hostingStats.virtualservers_total)}
          icon={getIcon(DnsOutlinedIcon, "goldenrod", "rgba(218, 165, 32, 0.2)")}
          link="/vm"
        />

        <Widget
          text="Domain Names"
          count={formatValue(hostingStats.domains)}
          icon={getIcon(DnsOutlinedIcon, "goldenrod", "rgba(218, 165, 32, 0.2)")}
        />

        <QuickRegistrationWidget />

      </div>

      {/* Main Content Area */}
      <div className="flex gap-5 flex-wrap">

        <SystemOverviewWidget />
        <RecentActivityWidget />
      </div>

    </div>
  );
}
