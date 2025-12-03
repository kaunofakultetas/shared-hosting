'use client';
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import Widget from "./components/Widget/Widget";
import QuickRegistrationWidget from "./components/QuickRegistrationWidget/QuickRegistrationWidget";
import SystemOverviewWidget from "./components/SystemOverviewWidget/SystemOverviewWidget";
import RecentActivityWidget from "./components/RecentActivityWidget/RecentActivityWidget";
import { useState, useEffect } from "react";
import axios from "axios";

// Icons
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';

const Home = ({ authdata }) => {
  // Loading state for API data
  const [isLoading, setIsLoading] = useState(true);

  // Hosting system stats from API
  const [hostingStats, setHostingStats] = useState({
    users: 0,
    virtualservers_running: 0,
    virtualservers_total: 0,
    domains: 0,
  });

  // Fetch hosting stats
  const fetchHostingStats = async () => {
    try {
      const response = await axios.get('/api/dashboard/hostingsystem', { withCredentials: true });
      if (response.status === 200) setHostingStats(response.data);
      setIsLoading(false);
    } catch (error) {
      console.error('Failed to fetch hosting stats:', error);
      setIsLoading(false);
    }
  };

  // Fetch data on mount and every 2 seconds
  useEffect(() => {
    fetchHostingStats();
    const interval = setInterval(fetchHostingStats, 2000);
    return () => clearInterval(interval);
  }, []);

  // Helper for consistent icon styling
  const getIcon = (IconComponent, color = "#7451f8", bgColor = "rgba(116, 81, 248, 0.2)") => {
    return (
      <IconComponent 
        className="text-lg p-1 rounded self-end"
        style={{ color, backgroundColor: bgColor }} 
      />
    );
  };

  // Format value: show "-" while loading and value is 0, otherwise show actual value
  const formatValue = (value) => {
    if (isLoading && (value === 0 || value === null || value === undefined)) return '—';
    return value;
  };

  return (
    <div>
      <Navbar />
      <div className="flex">
        <Sidebar authdata={authdata} />
        
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
      </div>
      
      <div className="bg-[#7b003f] h-[30px] flex justify-center items-center text-white text-xs fixed bottom-0 left-0 right-0"> 
        Copyright © | All Rights Reserved | VUKnF
      </div>
    </div>
  );
};

export default Home;
