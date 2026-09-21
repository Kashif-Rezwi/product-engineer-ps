'use client';

import React, { RefObject } from 'react';
import { ChatMessage, ConnectionStatus } from '@/src/lib/types';
import { MAX_RETRY_ATTEMPTS } from '@/src/lib/config';
import { MessageRow } from './MessageRow';
import { MarkdownContent } from './MarkdownContent';
import { ThinkingDots } from './ThinkingDots';
import { ErrorNotice } from './ErrorNotice';

interface ChatThreadProps {
  messages: ChatMessage[];
  showStream: boolean;
  streamText: string;
  isStreaming: boolean;
  status: ConnectionStatus;
  streamError: string | null;
  sendError: string | null;
  // Refs + handler owned by useAutoScroll in the page — attached here.
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  bottomRef: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
}

// Scrollable message history + live streaming bubble + connection notices.
export function ChatThread({
  messages,
  showStream,
  streamText,
  isStreaming,
  status,
  streamError,
  sendError,
  scrollContainerRef,
  bottomRef,
  onScroll,
}: ChatThreadProps) {
  return (
    <div ref={scrollContainerRef} onScroll={onScroll} className="flex-1 scroll-y">
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
                <MarkdownContent content={streamText} isStreaming={isStreaming} />
              ) : (
                /* Thinking dots */
                <ThinkingDots className="flex items-center gap-1.5 py-2" />
              )}
            </div>
          </div>
        )}

        {/* Reconnect notice */}
        {status === 'reconnecting' && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2 px-3.5 py-1 bg-warning/10 border border-warning/25 rounded-full text-[12px] text-warning font-medium animate-fadeIn">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-ping" />
              Reconnecting — resuming from Last-Event-ID…
            </div>
          </div>
        )}

        {/* Failure notice */}
        {status === 'failed' && (
          <ErrorNotice
            title="Stream failed — "
            className="my-4 py-3"
            iconClassName="w-5 h-5 shrink-0 mt-0.5"
            align="start"
          >
            {streamError || `Could not resume after ${MAX_RETRY_ATTEMPTS} attempts.`}
          </ErrorNotice>
        )}

        {/* Send error */}
        {sendError && <p className="text-xs text-error mt-2 px-1">{sendError}</p>}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
