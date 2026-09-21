'use client';

import React from 'react';
import { ConnectionStatus } from '@/src/lib/types';
import { StatusBadge } from './StatusBadge';
import { MenuIcon } from './icons';

interface ConversationHeaderProps {
  title: string;
  status: ConnectionStatus;
  attempt: number;
  onOpenSidebar: () => void;
}

// Slim top bar of the conversation page: mobile menu button,
// conversation title, and live stream status badge.
export function ConversationHeader({
  title,
  status,
  attempt,
  onOpenSidebar,
}: ConversationHeaderProps) {
  return (
    <header className="h-13 shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-line bg-paper/90 backdrop-blur z-10">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger menu */}
        <button
          onClick={onOpenSidebar}
          className="md:hidden p-1.5 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-sand/40 transition-colors shrink-0"
          title="Open sidebar"
        >
          <MenuIcon className="w-5 h-5" />
        </button>

        {/* Conversation Title */}
        <h1 className="text-sm font-medium text-ink truncate max-w-[280px] sm:max-w-[480px] md:max-w-[620px]">
          {title}
        </h1>
      </div>

      <StatusBadge status={status} attempt={attempt} />
    </header>
  );
}
