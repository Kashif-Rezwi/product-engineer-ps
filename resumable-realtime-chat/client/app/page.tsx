'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/src/components/Sidebar';
import { Composer } from '@/src/components/Composer';
import { StarterGrid } from '@/src/components/StarterGrid';
import { ErrorNotice } from '@/src/components/ErrorNotice';
import { useCreateConversation } from '@/src/lib/use-create-conversation';
import { useSidebarConversations } from '@/src/lib/use-sidebar-conversations';
import { APP_NAME } from '@/src/lib/config';
import { AppLogo } from '@/src/components/AppLogo';
import { useEmptyStateCopy } from '@/src/lib/empty-state-copy';
import { MenuIcon, PlusIcon } from '@/src/components/icons';

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
            <ErrorNotice className="mb-5 w-full max-w-2xl py-2.5">{error}</ErrorNotice>
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
          <StarterGrid onSelect={(prompt) => handleStart(prompt)} disabled={isCreating} />

          {/* Footer hint */}
          <p className="mt-6 text-xs text-stone font-mono tracking-wide text-center select-none">
            Enter ↵ to send · Shift+Enter for newline · Streams auto-resume via Last-Event-ID
          </p>
        </main>
      </div>
    </div>
  );
}
