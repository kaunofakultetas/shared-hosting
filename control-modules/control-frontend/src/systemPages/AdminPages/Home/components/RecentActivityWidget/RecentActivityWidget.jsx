'use client';
import { useState, useEffect } from "react";
import axios from "axios";

const RecentActivityWidget = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [activities, setActivities] = useState([]);

  // Fetch recent activity
  const fetchRecentActivity = async () => {
    try {
      const response = await axios.get('/api/dashboard/recentactivity', { withCredentials: true });
      if (response.status === 200) {
        setActivities(response.data);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to fetch recent activity:', error);
      setIsLoading(false);
    }
  };

  // Fetch data on mount and every 2 seconds
  useEffect(() => {
    fetchRecentActivity();
    const interval = setInterval(fetchRecentActivity, 2000);
    return () => clearInterval(interval);
  }, []);

  // Format time ago
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <div className="grow basis-0 shadow-md p-5 rounded-xl bg-white h-128">
      <h3 className="text-gray-500 mb-4 text-base font-medium">Recent Activity</h3>
      <ul className="list-none p-0 text-gray-600 text-sm">
        {isLoading ? (
          <li className="text-gray-400 italic">Loading...</li>
        ) : activities.length > 0 ? (
          activities.map((activity) => (
            <li key={activity.log_id} className="mb-2 pb-2 border-b border-gray-100">
              <span className="font-bold text-gray-700">{activity.email || 'System'}:</span> <br/> {activity.message} <br/>
              <span className="text-gray-400 text-xs">{formatTimeAgo(activity.time)}</span>
            </li>
          ))
        ) : (
          <li className="text-gray-400 italic">No recent activity</li>
        )}
      </ul>
    </div>
  );
};

export default RecentActivityWidget;

