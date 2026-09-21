'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/src/components/Sidebar';
import { Composer } from '@/src/components/Composer';
import { useCreateConversation } from '@/src/lib/use-create-conversation';
import { useSidebarConversations } from '@/src/lib/use-sidebar-conversations';
import { APP_NAME } from '@/src/lib/config';
import { AppLogo } from '@/src/components/AppLogo';
import { useEmptyStateCopy } from '@/src/lib/empty-state-copy';
import {
  MenuIcon,
  PlusIcon,
  AlertCircleIcon,
} from '@/src/components/icons';

const STARTERS = [
  {
    heading: 'How does SSE resumption work?',
    sub: 'Explain the Last-Event-ID cursor mechanism',
  },
  {
    heading: 'SSE vs WebSockets',
    sub: 'Trade-offs for real-time AI streaming',
  },
  {
    heading: 'Draft a Redis Streams pipeline',
    sub: 'Resilient event ingestion architecture',
  },
  {
    heading: 'Explain quantum computing',
    sub: 'Simple 3-sentence breakdown',
  },
];

export default function HomePage() {
  const [input, setInput] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const emptyStateCopy = useEmptyStateCopy();
  const { isCreating, error, createConversation } = useCreateConversation();
  const { conversations, handleDelete } = useSidebarConversations();

  function handleStart(promptText?: string) {
    const text = promptText ?? input.trim();
    setInput('');
    createConversation(text || undefined);
  }

  return (
    <div className="flex h-dvh bg-paper text-ink overflow-hidden font-sans">
      {/* ── Sidebar (desktop inline, mobile overlay) ── */}
      <Sidebar
        conversations={conversations}
        onNew={() => handleStart()}
        onDelete={handleDelete}
        isCreating={isCreating}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile top bar with hamburger menu */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-line bg-paper/90 backdrop-blur shrink-0">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-sand/40 transition-colors"
            title="Open sidebar"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <AppLogo size="sm" />
            <span className="text-sm font-semibold tracking-tight text-ink">
              {APP_NAME}
              <span className="text-claret">.</span>
            </span>
          </div>

          <button
            onClick={() => handleStart()}
            disabled={isCreating}
            className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-sand/40 transition-colors disabled:opacity-40"
            title="New chat"
          >
            <PlusIcon className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center min-w-0 px-4 pb-6 overflow-y-auto scroll-y">
          {/* Hero */}
          <div className="flex flex-col items-center gap-3 mb-8 text-center">
            <AppLogo size="lg" />
            <h1 className="font-display font-medium text-[clamp(28px,3.8vw,44px)] tracking-[-0.025em] text-ink leading-[1.1]">
              {emptyStateCopy.heading}
            </h1>
          </div>

          {/* Error notice */}
          {error && (
            <div className="mb-5 w-full max-w-2xl flex items-center gap-2.5 text-sm text-[#b0382b] bg-[#b0382b]/10 border border-[#b0382b]/25 rounded-xl px-4 py-2.5 animate-fadeIn">
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Composer */}
          <div className="w-full max-w-2xl">
            <Composer
              value={input}
              onChange={setInput}
              onSubmit={(text) => handleStart(text)}
              disabled={isCreating}
              sending={isCreating}
              minHeight="84px"
              placeholder={emptyStateCopy.placeholder}
            />
          </div>

          {/* Starter cards */}
          <div className="mt-5 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {STARTERS.map((s) => (
              <button
                key={s.heading}
                onClick={() => handleStart(s.heading)}
                disabled={isCreating}
                className="flex flex-col items-start text-left px-4 py-3.5 bg-paper-2 hover:bg-sand/35 border border-line hover:border-ink/40 rounded-2xl transition-all duration-200 ease-kiln shadow-xs group disabled:opacity-50"
              >
                <p className="text-sm font-medium text-ink leading-snug group-hover:text-claret transition-colors">
                  {s.heading}
                </p>
                <p className="text-xs text-muted mt-1 leading-snug">{s.sub}</p>
              </button>
            ))}
          </div>

          {/* Footer hint */}
          <p className="mt-6 text-xs text-stone font-mono tracking-wide text-center select-none">
            Enter ↵ to send · Shift+Enter for newline · Streams auto-resume via Last-Event-ID
          </p>
        </main>
      </div>
    </div>
  );
}
