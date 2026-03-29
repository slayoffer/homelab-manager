import { Shell, Sparkles } from 'lucide-react';

export const AI_WORKSPACES = {
  'openclaw-ai': { name: 'OpenClaw AI', Icon: Shell },
  'synthiq-ai': { name: 'Synthiq AI', Icon: Sparkles },
};

export const THEMES = {
  'openclaw-ai': {
    accent: 'text-red-400',
    accentBg: 'bg-red-500/20',
    bubble: 'bg-red-500/5 border-red-500/15',
    statusOn: 'text-red-400 border-red-400/30',
    statusOff: 'text-red-400/50 border-red-400/20',
    cursor: 'bg-red-400',
    emptyIcon: 'text-red-400/20',
    ring: 'ring-red-400/50',
  },
  'synthiq-ai': {
    accent: 'text-teal-400',
    accentBg: 'bg-teal-500/20',
    bubble: 'bg-teal-500/5 border-teal-500/15',
    statusOn: 'text-teal-400 border-teal-400/30',
    statusOff: 'text-teal-400/50 border-teal-400/20',
    cursor: 'bg-teal-400',
    emptyIcon: 'text-teal-400/20',
    ring: 'ring-teal-400/50',
  },
};
