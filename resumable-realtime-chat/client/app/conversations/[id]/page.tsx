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
import { useAutoScroll } from '@/src/lib/use-auto-scroll';
import { useDocumentTitle } from '@/src/lib/use-document-title';
import { truncateTitle, formatConversationTitle } from '@/src/lib/title';
import { Sidebar } from '@/src/components/Sidebar';
import { Composer } from '@/src/components/Composer';
import { ConversationHeader } from '@/src/components/ConversationHeader';
import { ChatThread } from '@/src/components/ChatThread';
import { EmptyConversationState } from '@/src/components/EmptyConversationState';
import { Spinner } from '@/src/components/Spinner';

/* ─── Suspense wrapper (needed for useSearchParams) ──────────────────────── */
export default function ConversationPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh bg-paper items-center justify-center">
          <Spinner />
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
  const { conversations, handleDelete } = useSidebarConversations();
  const emptyStateCopy = useEmptyStateCopy();

  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const isActive = status === 'connected' || status === 'reconnecting';
  const isSending = isActive;

  const { scrollContainerRef, bottomRef, handleScroll, scrollToBottom } = useAutoScroll();

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
    }
  }, [status, activeRunId, streamText, committed, markCommitted, commitAssistantMessage, convId]);

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
    scrollToBottom(isActive);
  }, [messages, streamText, isActive, scrollToBottom]);

  /* ── Stable send message handler ── */
  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isActive || !isReady) return;
      setInput('');
      setSendError(null);

      saveConversation(convId, truncateTitle(trimmed), trimmed);

      try {
        const { runId } = await sendMessage(trimmed);
        startStream(convId, runId);
      } catch (e: unknown) {
        setSendError(e instanceof Error ? e.message : 'Failed to send');
      }
    },
    [convId, sendMessage, startStream, isActive, isReady],
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
  const conversationTitle = formatConversationTitle(rawTitle, firstUserMessage);
  useDocumentTitle(`${conversationTitle} · ${APP_NAME}`);

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
        <ConversationHeader
          title={conversationTitle}
          status={status}
          attempt={reconnectAttempt}
          onOpenSidebar={() => setMobileSidebarOpen(true)}
        />

        {/* ── Chat body ── */}
        {!isReady && messages.length === 0 ? (
          /* Loading state */
          <div className="flex-1 flex items-center justify-center py-24">
            <Spinner />
          </div>
        ) : messages.length === 0 && !showStream ? (
          /* ── Centered Empty State (Greeting + Centered Composer) ── */
          <EmptyConversationState
            heading={emptyStateCopy.heading}
            placeholder={emptyStateCopy.placeholder}
            input={input}
            onInputChange={setInput}
            onSubmit={handleSend}
            disabled={isActive || !isReady}
            sending={isSending}
          />
        ) : (
          /* ── Active Conversation (Message Thread + Bottom-Pinned Composer) ── */
          <>
            <ChatThread
              messages={messages}
              showStream={showStream}
              streamText={streamText}
              isStreaming={isActive}
              status={status}
              streamError={streamError}
              sendError={sendError}
              scrollContainerRef={scrollContainerRef}
              bottomRef={bottomRef}
              onScroll={handleScroll}
            />

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
