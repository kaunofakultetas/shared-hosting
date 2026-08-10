// -----------------------------------------------------------
//  [*] UsageStats — the CPU / RAM / Disk row of a VM
//
//  Renders the backend's per-VM telemetry (the `usage` object
//  of /api/vm): CPU as a share of the whole host, RAM as the
//  working set, Disk as the VM's data directory. Values the
//  monitor has not measured are null and render as an em dash
//  — a stopped VM shows "— / — / <disk>", a brand-new one all
//  dashes until the first sweep.
//
//  CPU carries the load color (green < 50 %, amber < 80 %,
//  red above); RAM and Disk stay neutral — the VMs have no
//  quotas, so there is no honest percentage for them.
//
//  Split into (root component last):
//
//    formatMb   — 512 MB / 18.0 GB formatting
//    cpuColor   — the load → color thresholds
//    StatItem   — one label + value pair
//    UsageStats — the row (default export)
//
//  Used by:
//    - VirtualServersTable — every VM card
//    - VirtualServer — the detail header card
// -----------------------------------------------------------

import { useTranslations } from '@/i18n';


// MB below one GB, one-decimal GB above — matches how the
// dashboard widgets round
function formatMb(mb) {
  if (mb === null || mb === undefined) return null;
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}


// The dashboard's load thresholds
function cpuColor(percent) {
  if (percent < 50) return '#16a34a';
  if (percent < 80) return '#d97706';
  return '#dc2626';
}




// -----------------------------------------------------------
// StatItem
// -----------------------------------------------------------
//
// One stat: tiny grey uppercase label over the value. A null
// value renders as an em dash in grey.
//
// Used by:
//   - UsageStats (below) — three of these
// -----------------------------------------------------------

function StatItem({ label, value, color, large }) {
  return (
    <div className="flex flex-col">
      <span className={`uppercase tracking-wide text-gray-400 ${large ? 'text-xs' : 'text-[0.65rem]'}`}>
        {label}
      </span>
      <span
        className={`font-semibold ${large ? 'text-base' : 'text-sm'}`}
        style={{ color: value === null ? '#9ca3af' : (color || '#374151') }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}




// -----------------------------------------------------------
// UsageStats (default export)
// -----------------------------------------------------------
//
// Used by:
//   - VMCard (list) and VmHeaderCard (detail) — same data,
//     `large` only changes the type scale
// -----------------------------------------------------------

export default function UsageStats({ usage, large = false }) {

  const t = useTranslations('COMPONENTS.usageStats');

  const cpu = usage?.cpu_percent ?? null;

  return (
    <div className={`flex items-center ${large ? 'gap-8' : 'gap-6'}`}>
      <StatItem
        label={t('cpu')}
        value={cpu === null ? null : `${cpu}%`}
        color={cpu === null ? null : cpuColor(cpu)}
        large={large}
      />
      <StatItem label={t('ram')} value={formatMb(usage?.memory_mb ?? null)} large={large} />
      <StatItem label={t('disk')} value={formatMb(usage?.disk_mb ?? null)} large={large} />
    </div>
  );
}
