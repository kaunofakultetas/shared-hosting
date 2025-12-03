'use client';
import { useState, useEffect } from "react";
import axios from "axios";

// Icons
import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import SdStorageIcon from '@mui/icons-material/SdStorage';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';

const SystemOverviewWidget = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    cpu_percent: 0,
    memory_percent: 0,
    disk_percent: 0,
    cpu_cores: 0,
    memory_total_gb: 0,
    memory_used_gb: 0,
    disk_total_gb: 0,
    disk_used_gb: 0,
    dockerhub_pull_limits: null,
  });

  // Fetch system data
  const fetchSystemData = async () => {
    try {
      const response = await axios.get('/api/dashboard/system', { withCredentials: true });
      if (response.status === 200) {
        setStats(response.data);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch system data:', error);
      setIsLoading(false);
    }
  };

  // Fetch data on mount and every 2 seconds
  useEffect(() => {
    fetchSystemData();
    const interval = setInterval(fetchSystemData, 2000);
    return () => clearInterval(interval);
  }, []);

  // Get color based on usage percentage
  const getUsageColor = (percentage) => {
    if (percentage >= 80) return { color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' };
    if (percentage >= 60) return { color: '#f59e0b', bg: '#fffbeb', ring: '#fde68a' };
    return { color: '#10b981', bg: '#ecfdf5', ring: '#a7f3d0' };
  };

  // Format value: show "-" while loading
  const formatValue = (value) => {
    if (isLoading && (value === 0 || value === null || value === undefined)) return '—';
    return value;
  };

  return (
    <div className="grow-[2] basis-0 shadow-md p-5 rounded-xl bg-white min-h-64">
      <h3 className="text-gray-500 mb-6 text-base font-medium">System Overview</h3>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Usage */}
        {(() => {
          const colors = getUsageColor(stats.cpu_percent);
          return (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
              <div className="flex justify-center mb-3">
                <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                  <MemoryIcon style={{ color: colors.color, fontSize: '28px' }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                {formatValue(stats.cpu_percent)}%
              </div>
              <div className="text-gray-500 text-sm font-medium">
                CPU<br/>({formatValue(stats.cpu_cores)} cores)
              </div>
              <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.cpu_percent}%`, backgroundColor: colors.color }}
                />
              </div>
            </div>
          );
        })()}

        {/* RAM Usage */}
        {(() => {
          const colors = getUsageColor(stats.memory_percent);
          return (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
              <div className="flex justify-center mb-3">
                <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                  <StorageIcon style={{ color: colors.color, fontSize: '28px' }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                {formatValue(stats.memory_percent)}%
              </div>
              <div className="text-gray-500 text-sm font-medium">
                RAM<br/>({formatValue(stats.memory_used_gb)}/{formatValue(stats.memory_total_gb)} GB)
              </div>
              <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.memory_percent}%`, backgroundColor: colors.color }}
                />
              </div>
            </div>
          );
        })()}

        {/* Disk Usage */}
        {(() => {
          const colors = getUsageColor(stats.disk_percent);
          return (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
              <div className="flex justify-center mb-3">
                <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                  <SdStorageIcon style={{ color: colors.color, fontSize: '28px' }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                {formatValue(stats.disk_percent)}%
              </div>
              <div className="text-gray-500 text-sm font-medium">
                Disk<br/>({formatValue(stats.disk_used_gb)}/{formatValue(stats.disk_total_gb)} GB)
              </div>
              <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${stats.disk_percent}%`, backgroundColor: colors.color }}
                />
              </div>
            </div>
          );
        })()}

        {/* Docker Hub Rate Limit */}
        {(() => {
          const dockerhub = stats.dockerhub_pull_limits;
          const percent = dockerhub ? dockerhub.percent : 100;
          const colors = getUsageColor(100 - percent);
          return (
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
              <div className="flex justify-center mb-3">
                <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
                  <CloudDownloadIcon style={{ color: colors.color, fontSize: '28px' }} />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
                {dockerhub ? dockerhub.remaining : (isLoading ? '—' : 'N/A')}
              </div>
              <div className="text-gray-500 text-sm font-medium">
                Docker Hub<br/>({dockerhub ? `${dockerhub.used}/${dockerhub.limit}` : (isLoading ? '—' : 'N/A')})
              </div>
              <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${percent}%`, backgroundColor: colors.color }}
                />
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

export default SystemOverviewWidget;

