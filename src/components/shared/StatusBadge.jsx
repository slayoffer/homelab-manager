import { Badge } from '@/components/ui/badge';

const statusConfig = {
  running: { label: 'Running', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  exited: { label: 'Stopped', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  not_found: { label: 'Not Found', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  created: { label: 'Created', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  restarting: { label: 'Restarting', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  paused: { label: 'Paused', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  stub: { label: 'Coming Soon', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
  active: { label: 'Active', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  new: { label: 'New', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  optional: { label: 'Optional', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

export function StatusBadge({ status, label }) {
  const cfg = statusConfig[status] || { label: status, className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' };
  return (
    <Badge variant="outline" className={cfg.className}>
      {label || cfg.label}
    </Badge>
  );
}
