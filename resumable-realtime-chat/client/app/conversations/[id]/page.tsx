'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  Suspense,
} from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useConversation } from '@/src/lib/use-conversation';
import { useConversationStream } from '@/src/lib/use-conversation-stream';
import { APP_NAME } from '@/src/lib/config';
import { saveConversation } from '@/src/lib/conversations-store';
import { useCreateConversation } from '@/src/lib/use-create-conversation';
import { useSidebarConversations } from '@/src/lib/use-sidebar-conversations';
import { useEmptyStateCopy } from '@/src/lib/empty-state-copy';
import { Sidebar } from '@/src/components/Sidebar';
import { Composer } from '@/src/components/Composer';
import { MessageRow } from '@/src/components/MessageRow';
import { StatusBadge } from '@/src/components/StatusBadge';
import { AppLogo } from '@/src/components/AppLogo';
import {
  MenuIcon,
  AlertCircleIcon,
} from '@/src/components/icons';
import { MarkdownContent } from '@/src/components/MarkdownContent';

/* ─── Suspense wrapper (needed for useSearchParams) ──────────────────────── */
export default function ConversationPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh bg-paper items-center justify-center">
          <span className="w-5 h-5 rounded-full border-2 border-sand border-t-claret animate-spin" />
        </div>
      }
    >
      <ConversationPage />
    </Suspense>
  );
}

/* ─── Conversation page ──────────────────────────────────────────────────── */
function ConversationPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  // Defensive route param parsing
  const rawId = params?.id;
  const convId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : '';

  const {
    messages,
    isReady,
    latestRunningRunId,
    sendMessage,
    commitAssistantMessage,
  } = useConversation(convId);

  const {
    status,
    text: streamText,
    runId: activeRunId,
    reconnectAttempt,
    error: streamError,
    committed,
    startStream,
    markCommitted,
  } = useConversationStream();

  const { isCreating, createConversation } = useCreateConversation();
  const { conversations, handleDelete, refresh } = useSidebarConversations(convId);
  const emptyStateCopy = useEmptyStateCopy();

  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isActive = status === 'connected' || status === 'reconnecting';
  const isSending = isActive;

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Keep track of scroll position so we don't snap away if user is reading backlog
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 150;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
  }, []);

  /* ── Commit stream on completion ── */
  useEffect(() => {
    if (
      status === 'completed' &&
      activeRunId &&
      streamText &&
      !committed
    ) {
      markCommitted();
      commitAssistantMessage(activeRunId, streamText);
      saveConversation(convId, undefined, streamText.slice(0, 64));
      refresh();
    }
  }, [status, activeRunId, streamText, committed, markCommitted, commitAssistantMessage, convId, refresh]);

  /* ── Re-attach to running run if navigating to an active conversation ── */
  const reattachedRef = useRef(false);
  useEffect(() => {
    if (
      isReady &&
      latestRunningRunId &&
      !reattachedRef.current &&
      status === 'disconnected'
    ) {
      reattachedRef.current = true;
      startStream(convId, latestRunningRunId);
    }
  }, [isReady, latestRunningRunId, convId, startStream, status]);

  /* ── Auto scroll ── */
  useEffect(() => {
    if (!isNearBottomRef.current) return;
    if (isActive) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamText, isActive]);

  /* ── Stable send message handler ── */
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isActiveRef.current || !isReadyRef.current) return;
      setInput('');
      setSendError(null);

      saveConversation(
        convId,
        trimmed.length > 48 ? trimmed.slice(0, 48).trimEnd() + '...' : trimmed,
        trimmed
      );
      refresh();

      try {
        const { runId } = await sendMessage(trimmed);
        startStream(convId, runId);
      } catch (e: unknown) {
        setSendError(e instanceof Error ? e.message : 'Failed to send');
      }
    },
    [convId, sendMessage, startStream, refresh],
  );

  /* ── Auto-send initial prompt from query param (from starter prompts) ── */
  const promptSentRef = useRef(false);
  useEffect(() => {
    const p = searchParams.get('prompt');
    if (p && isReady && messages.length === 0 && !promptSentRef.current) {
      promptSentRef.current = true;
      handleSend(p);
      window.history.replaceState(null, '', `/conversations/${convId}`);
    }
  }, [searchParams, isReady, messages.length, handleSend, convId]);

  /* ── Dynamic conversation title & browser tab title ── */
  const activeConv = conversations.find((c) => c.id === convId);
  const firstUserMessage = messages.find((m) => m.role === 'user')?.content;
  const rawTitle = activeConv?.title || firstUserMessage || 'New conversation';

  const formatTitle = (text: string) => {
    if (!text || text === 'New conversation') return text;
    if (firstUserMessage && firstUserMessage.length > 48) {
      return firstUserMessage.slice(0, 48).trimEnd() + '...';
    }
    if (text.endsWith('...') || text.endsWith('…')) return text;
    if (text.length >= 45) {
      return text.slice(0, 45).trimEnd() + '...';
    }
    return text;
  };

  const conversationTitle = formatTitle(rawTitle);

  useEffect(() => {
    document.title = `${conversationTitle} · ${APP_NAME}`;
  }, [conversationTitle]);

  /* ── Show streaming bubble? ── */
  const showStream = (isActive || (status === 'completed' && !committed)) && !!activeRunId;

  return (
    <div className="flex h-dvh bg-paper text-ink overflow-hidden font-sans">
      {/* ── Sidebar (desktop inline, mobile overlay) ── */}
      <Sidebar
        activeId={convId}
        conversations={conversations}
        onNew={() => createConversation()}
        onDelete={handleDelete}
        isCreating={isCreating}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />

      {/* ── Chat column ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Slim top bar */}
        <header className="h-13 shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-line bg-paper/90 backdrop-blur z-10">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger menu */}
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1 rounded-lg text-muted hover:text-ink hover:bg-sand/40 transition-colors shrink-0"
              title="Open sidebar"
            >
              <MenuIcon className="w-5 h-5" />
            </button>

            {/* Conversation Title */}
            <h1 className="text-sm font-medium text-ink truncate max-w-[280px] sm:max-w-[480px] md:max-w-[620px]">
              {conversationTitle}
            </h1>
          </div>

          <StatusBadge status={status} attempt={reconnectAttempt} />
        </header>

        {/* ── Chat body ── */}
        {!isReady && messages.length === 0 ? (
          /* Loading state */
          <div className="flex-1 flex items-center justify-center py-24">
            <span className="w-5 h-5 rounded-full border-2 border-sand border-t-claret animate-spin" />
          </div>
        ) : messages.length === 0 && !showStream ? (
          /* ── Centered Empty State (Greeting + Centered Composer) ── */
          <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 select-none animate-fadeIn overflow-y-auto">
            <div className="w-full max-w-2xl flex flex-col items-center -mt-10 sm:-mt-16">
              {/* Stylistic & bold headline */}
              <div className="flex items-center justify-center gap-3.5 sm:gap-4 mb-7 sm:mb-8">
                <AppLogo size="md" className="shadow-xs shrink-0" />
                <h2 className="font-display font-normal text-[26px] sm:text-3xl md:text-[38px] lg:text-[40px] text-ink tracking-tight leading-none text-center">
                  {emptyStateCopy.heading}
                </h2>
              </div>

              {/* Centered Composer */}
              <div className="w-full">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  disabled={isActive || !isReady}
                  sending={isSending}
                  minHeight="84px"
                  autoFocus={true}
                  placeholder={emptyStateCopy.placeholder}
                />
                <p className="mt-3 text-center text-[11px] text-stone font-mono tracking-wide select-none">
                  Enter ↵ to send · Shift+Enter for newline · Resumes from cursor on disconnect
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* ── Active Conversation (Message Thread + Bottom-Pinned Composer) ── */
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 scroll-y"
            >
              <div className="max-w-3xl mx-auto w-full px-4 pt-6 pb-4 flex flex-col gap-1">
                {/* Committed messages */}
                {messages.map((msg) => (
                  <MessageRow key={msg.id} message={msg} />
                ))}

                {/* Live streaming bubble */}
                {showStream && (
                  <div className="py-4 w-full">
                    <div className="w-full">
                      {streamText ? (
                        <MarkdownContent content={streamText} isStreaming={isActive} />
                      ) : (
                        /* Thinking dots */
                        <div className="flex items-center gap-1.5 py-2">
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                          <span className="thinking-dot" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reconnect notice */}
                {status === 'reconnecting' && (
                  <div className="flex justify-center py-2">
                    <div className="flex items-center gap-2 px-3.5 py-1 bg-[#b46914]/10 border border-[#b46914]/25 rounded-full text-[12px] text-[#b46914] font-medium animate-fadeIn">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#b46914] animate-ping" />
                      Reconnecting — resuming from Last-Event-ID…
                    </div>
                  </div>
                )}

                {/* Failure notice */}
                {status === 'failed' && (
                  <div className="my-4 rounded-xl border border-[#b0382b]/25 bg-[#b0382b]/10 px-4 py-3 text-sm text-[#b0382b] flex items-start gap-2.5 animate-fadeIn">
                    <AlertCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">Stream failed — </span>
                      {streamError || 'Could not resume after 3 attempts.'}
                    </div>
                  </div>
                )}

                {/* Send error */}
                {sendError && (
                  <p className="text-xs text-[#b0382b] mt-2 px-1">{sendError}</p>
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* Composer bottom pinned */}
            <div className="shrink-0 px-4 pb-5 pt-2 bg-gradient-to-t from-paper via-paper to-transparent">
              <div className="max-w-3xl mx-auto w-full">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  disabled={isActive || !isReady}
                  sending={isSending}
                  placeholder={
                    isActive
                      ? 'Streaming…'
                      : !isReady
                      ? 'Loading conversation…'
                      : `Message ${APP_NAME}…`
                  }
                />
                <p className="mt-2.5 text-center text-[11px] text-stone font-mono tracking-wide select-none">
                  Enter ↵ to send · Shift+Enter for newline · Resumes from cursor on disconnect
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
