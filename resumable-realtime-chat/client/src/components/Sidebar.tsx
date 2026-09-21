'use client';

// Shared sidebar — used by both the home page and any conversation page.
// Renders brand logo, "New chat" button, conversation list, and a footer tag.

import React from 'react';
import Link from 'next/link';
import { StoredConversation } from '@/src/lib/conversations-store';
import { APP_NAME } from '@/src/lib/config';
import { AppLogo } from './AppLogo';
import { NewChatIcon, CloseIcon, TrashIcon } from './icons';

interface SidebarProps {
  // ID of the currently active conversation, if any 
  activeId?: string;
  conversations: StoredConversation[];
  onNew: () => void;
  onDelete: (id: string) => void;
  isCreating: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}
// Cleans a conversation title by removing trailing ellipses and trimming whitespace.
function cleanTitle(title?: string): string {
  if (!title) return 'New conversation';
  return title.replace(/\s+(\.{3}|…)/g, '...').trim();
}

export function Sidebar({
  activeId,
  conversations,
  onNew,
  onDelete,
  isCreating,
  isOpen = false,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs z-40 md:hidden transition-opacity duration-[var(--duration-fast)]"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed md:relative inset-y-0 left-0 z-50 w-[260px] shrink-0 flex flex-col h-full bg-sidebar border-r border-line transition-transform duration-200 ease-kiln md:translate-x-0 ${
          isOpen ? 'translate-x-0 shadow-lg' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          {/* Logo / home link */}
          <Link
            href="/"
            onClick={onClose}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sand/40 transition-colors"
          >
            <AppLogo size="sm" />
            <span className="text-sm font-semibold text-ink tracking-tight">
              {APP_NAME}
              <span className="text-claret">.</span>
            </span>
          </Link>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* New chat icon button */}
            <button
              onClick={() => {
                onNew();
                onClose?.();
              }}
              disabled={isCreating}
              title="New chat"
              className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-sand/50 transition-colors disabled:opacity-40"
            >
              {isCreating ? (
                <span className="w-4 h-4 block rounded-full border-2 border-stone/30 border-t-claret animate-spin" />
              ) : (
                <NewChatIcon className="w-4 h-4" />
              )}
            </button>

            {/* Close button on mobile */}
            {onClose && (
              <button
                onClick={onClose}
                title="Close sidebar"
                className="md:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-sand/50 transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Conversation list ── */}
        <nav className="flex-1 scroll-y px-2 py-2">
          {conversations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-stone text-center select-none font-sans">
              Your conversations will appear here.
            </p>
          ) : (
            <div>
              <p className="px-3 mb-1.5 text-[11px] font-mono font-medium uppercase tracking-[0.12em] text-stone select-none">
                Recents
              </p>
              <ul className="flex flex-col gap-1">
                {conversations.map((c) => {
                  const isActive = c.id === activeId;
                  return (
                    <li key={c.id} className="group relative flex items-center">
                      <Link
                        href={`/conversations/${c.id}`}
                        onClick={onClose}
                        className={`flex-1 min-w-0 flex items-center px-3 py-2.5 rounded-xl transition-all duration-150 ${
                          isActive
                            ? 'bg-paper-2 border border-line text-ink font-medium shadow-xs'
                            : 'border border-transparent text-muted hover:bg-sand/40 hover:text-ink'
                        }`}
                      >
                        <span className="text-sm truncate block w-full leading-normal">
                          {cleanTitle(c.title)}
                        </span>
                      </Link>

                      {/* Delete button: appears floating over the right on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onDelete(c.id);
                        }}
                        title="Delete conversation"
                        className="absolute right-1.5 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-opacity duration-150 text-stone hover:text-claret bg-paper-2 hover:bg-sand/80 border border-line shadow-xs"
                      >
                        <TrashIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className="px-2 py-3 border-t border-line flex items-center justify-center">
          <p className="text-[9.5px] text-stone font-mono tracking-wide text-center whitespace-nowrap select-none">
            SSE · REDIS STREAMS · LAST-EVENT-ID
          </p>
        </div>
      </aside>
    </>
  );
}
