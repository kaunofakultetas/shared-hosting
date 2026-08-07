// -----------------------------------------------------------
//  [*] RecentActivityWidget — system-wide activity feed
//
//  Dashboard card listing the latest activity of every user
//  ("email: message, 5 mins ago"), from
//  /api/dashboard/recentactivity every 2 seconds. The
//  per-user variant of this list lives on the Account page.
//
//  Used by:
//    - Home.jsx — right card of the main content row
// -----------------------------------------------------------

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from "@mui/material";
import axios from "axios";


// Timestamps arrive absolute; the list shows them relative
// ("5 mins ago")
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


// -----------------------------------------------------------
// RecentActivityWidget (default export)
// -----------------------------------------------------------
//
// Used by:
//   - Home.jsx — right card of the main content row
// -----------------------------------------------------------

export default function RecentActivityWidget() {

  // System-wide activity, polled every 2 seconds
  const { data: activities = [], isPending } = useQuery({
    queryKey: ['dashboard-recentactivity'],
    queryFn: async () => (await axios.get('/api/dashboard/recentactivity', { withCredentials: true })).data,
    refetchInterval: 2000,
  });


  return (
    <div className="grow basis-0 shadow-md p-5 rounded-xl bg-white h-128">
      <h3 className="text-gray-500 mb-4 text-base font-medium">Recent Activity</h3>
      <ul className="list-none p-0 text-gray-600 text-sm">
        {isPending ? (
          [...Array(4)].map((_, i) => (
            <li key={i} className="mb-2 pb-2 border-b border-gray-100">
              <Skeleton variant="text" width="40%" />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="25%" height={14} />
            </li>
          ))
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
}
