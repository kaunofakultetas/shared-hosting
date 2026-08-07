// -----------------------------------------------------------
//  [*] SystemOverviewWidget — host resource gauges
//
//  The wide dashboard card with four stat cells: CPU, RAM,
//  disk and the Docker Hub pull limit — each an icon in a
//  colored ring, the big number, a caption and a progress
//  bar, all tinted green/amber/red by usage. Data comes from
//  /api/dashboard/system every 2 seconds.
//
//  The Docker Hub cell inverts its meaning: the big number is
//  pulls REMAINING, while the bar and tint run on percent
//  used (dockerhub_pull_limits may be null → "N/A").
//
//  Split into (root component last):
//
//    getUsageColor        — green/amber/red from 60/80 (CPU,
//                           Docker Hub)
//    getUsageColorRam     — same colors from 80/90 (RAM)
//    getUsageColorDisk    — same colors from 80/90 (disk)
//    StatCell             — one gauge cell
//    SystemOverviewWidget — data + the four cells (default
//                           export)
//
//  Used by:
//    - Home.jsx — left card of the main content row
// -----------------------------------------------------------

import { useQuery } from '@tanstack/react-query';
import axios from "axios";

import MemoryIcon from '@mui/icons-material/Memory';
import StorageIcon from '@mui/icons-material/Storage';
import SdStorageIcon from '@mui/icons-material/SdStorage';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';







// -----------------------------------------------------------
// getUsageColor
// -----------------------------------------------------------
//
// Green/amber/red tint set from a usage percentage — CPU and
// Docker Hub turn amber at 60% and red at 80%; RAM and disk
// (below) only at 80%/90%.
//
// Used by:
//   - SystemOverviewWidget (below) — the CPU and Docker Hub
//     cells
// -----------------------------------------------------------

const getUsageColor = (percentage) => {
  if (percentage >= 80) return { color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' };
  if (percentage >= 60) return { color: '#f59e0b', bg: '#fffbeb', ring: '#fde68a' };
  return { color: '#10b981', bg: '#ecfdf5', ring: '#a7f3d0' };
};







// -----------------------------------------------------------
// getUsageColorRam
// -----------------------------------------------------------
//
// RAM variant — higher thresholds (identical to the disk one,
// kept separate so each gauge can be tuned on its own).
//
// Used by:
//   - SystemOverviewWidget (below) — the RAM cell
// -----------------------------------------------------------

const getUsageColorRam = (percentage) => {
  if (percentage >= 90) return { color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' };
  if (percentage >= 80) return { color: '#f59e0b', bg: '#fffbeb', ring: '#fde68a' };
  return { color: '#10b981', bg: '#ecfdf5', ring: '#a7f3d0' };
};







// -----------------------------------------------------------
// getUsageColorDisk
// -----------------------------------------------------------
//
// Disk variant — see getUsageColorRam.
//
// Used by:
//   - SystemOverviewWidget (below) — the disk cell
// -----------------------------------------------------------

const getUsageColorDisk = (percentage) => {
  if (percentage >= 90) return { color: '#dc2626', bg: '#fef2f2', ring: '#fecaca' };
  if (percentage >= 80) return { color: '#f59e0b', bg: '#fffbeb', ring: '#fde68a' };
  return { color: '#10b981', bg: '#ecfdf5', ring: '#a7f3d0' };
};







// -----------------------------------------------------------
// StatCell
// -----------------------------------------------------------
//
// One gauge cell: ringed icon, big value, caption and the
// progress bar, every part tinted from the passed colors.
//
// Used by:
//   - SystemOverviewWidget (below) — all four cells
// -----------------------------------------------------------

function StatCell({ colors, icon: Icon, value, label, barPercent }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.bg }}>
      <div className="flex justify-center mb-3">
        <div className="p-3 rounded-full" style={{ backgroundColor: colors.ring }}>
          <Icon style={{ color: colors.color, fontSize: '28px' }} />
        </div>
      </div>
      <div className="text-3xl font-bold mb-1" style={{ color: colors.color }}>
        {value}
      </div>
      <div className="text-gray-500 text-sm font-medium">
        {label}
      </div>
      <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${barPercent}%`, backgroundColor: colors.color }}
        />
      </div>
    </div>
  );
}







// -----------------------------------------------------------
// SystemOverviewWidget (default export)
// -----------------------------------------------------------
//
// Used by:
//   - Home.jsx — left card of the main content row
// -----------------------------------------------------------

export default function SystemOverviewWidget() {

  // Host resource stats, polled every 2 seconds
  const { data: stats = {
    cpu_percent: 0,
    memory_percent: 0,
    disk_percent: 0,
    cpu_cores: 0,
    memory_total_gb: 0,
    memory_used_gb: 0,
    disk_total_gb: 0,
    disk_used_gb: 0,
    dockerhub_pull_limits: null,
  }, isPending } = useQuery({
    queryKey: ['dashboard-system'],
    queryFn: async () => (await axios.get('/api/dashboard/system', { withCredentials: true })).data,
    refetchInterval: 2000,
  });


  // Format value: show "—" while loading and value is 0,
  // otherwise show actual value
  const formatValue = (value) => {
    if (isPending && (value === 0 || value === null || value === undefined)) return '—';
    return value;
  };


  const cpuColors = getUsageColor(stats.cpu_percent);
  const ramColors = getUsageColorRam(stats.memory_percent);
  const diskColors = getUsageColorDisk(stats.disk_percent);

  // Docker Hub: big number is REMAINING pulls, tint and bar
  // run on percent used
  const dockerhub = stats.dockerhub_pull_limits;
  const dockerhubPercent = dockerhub ? dockerhub.percent : 100;
  const dockerhubColors = getUsageColor(100 - dockerhubPercent);


  return (
    <div className="grow-[2] basis-0 shadow-md p-5 rounded-xl bg-white min-h-64">
      <h3 className="text-gray-500 mb-6 text-base font-medium">System Overview</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCell
          colors={cpuColors}
          icon={MemoryIcon}
          value={<>{formatValue(stats.cpu_percent)}%</>}
          label={<>CPU<br/>({formatValue(stats.cpu_cores)} cores)</>}
          barPercent={stats.cpu_percent}
        />

        <StatCell
          colors={ramColors}
          icon={StorageIcon}
          value={<>{formatValue(stats.memory_percent)}%</>}
          label={<>RAM<br/>({formatValue(stats.memory_used_gb)}/{formatValue(stats.memory_total_gb)} GB)</>}
          barPercent={stats.memory_percent}
        />

        <StatCell
          colors={diskColors}
          icon={SdStorageIcon}
          value={<>{formatValue(stats.disk_percent)}%</>}
          label={<>Disk<br/>({formatValue(stats.disk_used_gb)}/{formatValue(stats.disk_total_gb)} GB)</>}
          barPercent={stats.disk_percent}
        />

        <StatCell
          colors={dockerhubColors}
          icon={CloudDownloadIcon}
          value={dockerhub ? dockerhub.remaining : (isPending ? '—' : 'N/A')}
          label={<>Docker Hub<br/>({dockerhub ? `${dockerhub.used}/${dockerhub.limit}` : (isPending ? '—' : 'N/A')})</>}
          barPercent={dockerhubPercent}
        />
      </div>
    </div>
  );
}
