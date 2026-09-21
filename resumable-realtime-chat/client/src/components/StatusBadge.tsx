'use client';

import React from 'react';
import { ConnectionStatus } from '@/src/lib/types';

interface StatusBadgeProps {
  status: ConnectionStatus;
  attempt: number;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; dot: string; ring: string }> = {
  disconnected: {
    label: 'Idle',
    dot:  'bg-stone',
    ring: 'text-stone border-line bg-sand/40',
  },
  connected: {
    label: 'Streaming',
    dot:  'bg-claret animate-pulse',
    ring: 'text-claret border-claret/30 bg-claret/10',
  },
  reconnecting: {
    label: 'Reconnecting',
    dot:  'bg-[#b46914] animate-ping',
    ring: 'text-[#b46914] border-[#b46914]/30 bg-[#b46914]/10',
  },
  completed: {
    label: 'Done',
    dot:  'bg-[#2e6945]',
    ring: 'text-[#2e6945] border-[#2e6945]/30 bg-[#2e6945]/10',
  },
  failed: {
    label: 'Failed',
    dot:  'bg-[#b0382b]',
    ring: 'text-[#b0382b] border-[#b0382b]/30 bg-[#b0382b]/10',
  },
};

// StatusBadge — shows current SSE connection state in the conversation header.
export function StatusBadge({ status, attempt }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const label =
    status === 'reconnecting' ? `Retry ${attempt}/3` : cfg.label;

  return (
    <span
      id="status-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium font-sans transition-colors ${cfg.ring}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {label}
    </span>
  );
}
