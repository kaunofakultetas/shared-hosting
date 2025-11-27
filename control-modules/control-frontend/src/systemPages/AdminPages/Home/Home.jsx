'use client';
import Sidebar from "@/components/Admin/Sidebar/Sidebar";
import Navbar from "@/components/Navbar/Navbar";
import Widget from "@/components/Admin/Widget/Widget";
import React, { useState, useEffect } from "react";
import { Modal, ModalDialog, Button } from "@mui/joy";

// Icons
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined';
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import SdStorageIcon from '@mui/icons-material/SdStorage';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import toast from 'react-hot-toast';

const Home = ({ authdata }) => {
  // Quick Registration state
  const [quickRegEnabled, setQuickRegEnabled] = useState(false);
  const [quickRegCode, setQuickRegCode] = useState('');
  const [quickRegExpiry, setQuickRegExpiry] = useState(null);
  const [remainingTime, setRemainingTime] = useState('');
  const [showCodeModal, setShowCodeModal] = useState(false);

  // System stats (mock data - replace with API call)
  const [systemStats, setSystemStats] = useState({
    cpu: 45,
    ram: 62,
    disk: 38
  });

  // Generate random 8-char uppercase code
  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Handle Turn ON quick registration
  const handleTurnOn = () => {
    const code = generateCode();
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
    setQuickRegCode(code);
    setQuickRegExpiry(expiry);
    setQuickRegEnabled(true);
    toast.success('Quick Registration enabled!');
    // TODO: Send to backend
  };

  // Handle Turn OFF quick registration
  const handleTurnOff = () => {
    setQuickRegEnabled(false);
    setQuickRegCode('');
    setQuickRegExpiry(null);
    setRemainingTime('');
    toast.success('Quick Registration disabled');
    // TODO: Send to backend
  };

  // Countdown timer effect
  useEffect(() => {
    if (!quickRegEnabled || !quickRegExpiry) return;

    const interval = setInterval(() => {
      const now = new Date();
      const diff = quickRegExpiry - now;

      if (diff <= 0) {
        handleTurnOff();
        toast('Quick Registration expired', { icon: '⏰' });
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setRemainingTime(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [quickRegEnabled, quickRegExpiry]);

  // Copy code to clipboard
  const copyCode = () => {
    navigator.clipboard.writeText(quickRegCode);
    toast.success('Code copied to clipboard!');
  };

  // Helper for consistent icon styling
  const getIcon = (IconComponent, color = "#7451f8", bgColor = "rgba(116, 81, 248, 0.2)") => {
    return (
      <IconComponent 
        className="text-lg p-1 rounded self-end"
        style={{ color, backgroundColor: bgColor }} 
      />
    );
  };

  // Get color based on usage percentage
  const getUsageColor = (percentage) => {
    if (percentage >= 80) return { color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' };
    if (percentage >= 60) return { color: '#f59e0b', bg: '#fffbeb', ring: '#fde68a' };
    return { color: '#10b981', bg: '#ecfdf5', ring: '#a7f3d0' };
  };

  return (
    <div>
      <Navbar />
      <div className="flex">
        <Sidebar authdata={authdata} />
        
        <div className="grow-[6] bg-gray-100 p-5" style={{ height: "calc(100vh - 105px)" }}>

          {/* Top Widgets - 3 items */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-5">
            
            <Widget 
              type="user" 
              text="Users" 
              count={12} 
              percentage={5} 
              icon={getIcon(PeopleOutlinedIcon, "crimson", "rgba(255, 0, 0, 0.2)")} 
              link="/admin/users" 
            />
            
            <Widget 
              type="order" 
              text="Virtual Servers" 
              count={25} 
              percentage={10}
              icon={getIcon(DnsOutlinedIcon, "goldenrod", "rgba(218, 165, 32, 0.2)")} 
              link="/admin/servers"
            />
            
            {/* Quick Registration Widget - matching Widget component style */}
            <div 
              className="flex justify-between bg-white"
              style={{
                padding: '10px',
                boxShadow: '2px 4px 10px 1px rgba(201, 201, 201, 0.47)',
                borderRadius: '15px',
                height: '100px',
              }}
            >
              {/* Left side */}
              <div className="flex flex-col justify-between">
                <span className="font-bold text-sm text-gray-400">Quick Registration</span>
                {quickRegEnabled ? (
                  <button 
                    onClick={() => setShowCodeModal(true)}
                    className="bg-purple-100 text-purple-700 font-mono font-bold text-xl py-1 px-2 rounded tracking-widest hover:bg-purple-200 transition-colors cursor-pointer border-none"
                  >
                    {quickRegCode}
                  </button>
                ) : (
                  <span className="text-3xl font-light text-gray-400">OFF</span>
                )}
              </div>
              
              {/* Right side */}
              <div className="flex flex-col justify-between items-end mr-2">
                {quickRegEnabled ? (
                  <>
                    <span className="text-sm text-orange-500 font-mono font-medium">{remainingTime}</span>
                    <button 
                      onClick={handleTurnOff}
                      className="bg-red-500 hover:bg-red-600 text-white text-xs font-medium py-1.5 w-20 rounded transition-colors cursor-pointer border-none"
                    >
                      Turn OFF
                    </button>
                  </>
                ) : (
                  <>
                    <div></div>
                    <button 
                      onClick={handleTurnOn}
                      className="bg-green-500 hover:bg-green-600 text-white text-xs font-medium py-1.5 w-20 rounded transition-colors cursor-pointer border-none"
                    >
                      Turn ON
                    </button>
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Main Content Area */}
          <div className="flex gap-5 flex-wrap">
            
            {/* System Overview - CPU, RAM, Disk */}
            <div className="grow-[2] basis-0 shadow-md p-5 rounded-xl bg-white min-h-128">
              <h3 className="text-gray-500 mb-6 text-base font-medium">System Overview</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* CPU Usage */}
                {(() => {
                  const colors = getUsageColor(systemStats.cpu);
                  return (
                    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                          <MemoryIcon style={{ color: colors.color, fontSize: '28px' }} />
                        </div>
                      </div>
                      <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                        {systemStats.cpu}%
                      </div>
                      <div className="text-gray-500 text-sm font-medium">CPU Usage</div>
                      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${systemStats.cpu}%`, backgroundColor: colors.color }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* RAM Usage */}
                {(() => {
                  const colors = getUsageColor(systemStats.ram);
                  return (
                    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                          <StorageIcon style={{ color: colors.color, fontSize: '28px' }} />
                        </div>
                      </div>
                      <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                        {systemStats.ram}%
                      </div>
                      <div className="text-gray-500 text-sm font-medium">RAM Usage</div>
                      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${systemStats.ram}%`, backgroundColor: colors.color }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Disk Usage */}
                {(() => {
                  const colors = getUsageColor(systemStats.disk);
                  return (
                    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
                      <div className="flex justify-center mb-3">
                        <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                          <SdStorageIcon style={{ color: colors.color, fontSize: '28px' }} />
                        </div>
                      </div>
                      <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                        {systemStats.disk}%
                      </div>
                      <div className="text-gray-500 text-sm font-medium">Disk Usage</div>
                      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${systemStats.disk}%`, backgroundColor: colors.color }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="grow basis-0 shadow-md p-5 rounded-xl bg-white min-h-64">
              <h3 className="text-gray-500 mb-4 text-base font-medium">Recent Activity</h3>
              <ul className="list-none p-0 text-gray-600 text-sm">
                <li className="mb-2 pb-2 border-b border-gray-100">
                  <span className="font-bold text-gray-700">User1</span> created a new server <br/>
                  <span className="text-gray-400 text-xs">2 mins ago</span>
                </li>
                <li className="mb-2 pb-2 border-b border-gray-100">
                  <span className="font-bold text-gray-700">User2</span> logged in <br/>
                  <span className="text-gray-400 text-xs">1 hour ago</span>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </div>
      
      <div className="bg-[#7b003f] h-[30px] flex justify-center items-center text-white text-xs fixed bottom-0 left-0 right-0"> 
        Copyright © | All Rights Reserved | VUKnF
      </div>

      {/* Code Display Modal */}
      <Modal open={showCodeModal} onClose={() => setShowCodeModal(false)}>
        <ModalDialog
          sx={{
            width: '90vw',
            maxWidth: '600px',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
            backgroundColor: '#1a1a2e',
          }}
        >
          <h2 className="text-white text-xl font-medium mb-2">Quick Registration Code</h2>
          <p className="text-gray-400 text-sm mb-6">Share this code with students to register</p>
          
          <div 
            className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-mono font-bold py-6 px-8 rounded-2xl mb-6 tracking-[0.3em] select-all cursor-pointer hover:scale-105 transition-transform"
            style={{ fontSize: 'clamp(2rem, 8vw, 4rem)' }}
            onClick={copyCode}
          >
            {quickRegCode}
          </div>
          
          <div className="flex items-center justify-center gap-2 text-orange-400 mb-6">
            <span className="text-lg">⏱</span>
            <span className="font-mono text-xl">{remainingTime}</span>
            <span className="text-gray-400 text-sm">remaining</span>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={copyCode}
              sx={{
                backgroundColor: '#6366f1',
                '&:hover': { backgroundColor: '#4f46e5' },
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <ContentCopyIcon fontSize="small" />
              Copy Code
            </Button>
            <Button
              onClick={() => setShowCodeModal(false)}
              variant="outlined"
              sx={{
                color: '#9ca3af',
                borderColor: '#4b5563',
                '&:hover': { backgroundColor: '#374151', borderColor: '#6b7280' },
              }}
            >
              Close
            </Button>
          </div>
        </ModalDialog>
      </Modal>
    </div>
  );
};

export default Home;
