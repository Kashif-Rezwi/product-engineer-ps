'use client';

// MessageRow — renders a single committed chat message (user or assistant).

import React, { memo, useCallback } from 'react';
import { ChatMessage } from '@/src/lib/types';
import { useCopyToClipboard } from '@/src/lib/use-copy-to-clipboard';
import { MarkdownContent } from './MarkdownContent';
import { CopyIcon, CheckIcon, AlertCircleIcon } from './icons';

function MessageRowBase({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const { copied, copy } = useCopyToClipboard();

  const handleCopy = useCallback(() => {
    copy(message.content);
  }, [copy, message.content]);

  if (isUser) {
    return (
      <div className="flex justify-end py-3">
        <div className="max-w-[75%] bg-paper-2 border border-line rounded-2xl rounded-br-xs px-4 py-3 text-[0.9375rem] leading-relaxed text-ink shadow-xs whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 w-full group">
      <div className="w-full">
        {message.isError ? (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-error/10 border border-error/25 text-error text-[13px]">
            <AlertCircleIcon className="w-4 h-4 shrink-0" />
            <span>{message.content}</span>
          </div>
        ) : (
          <MarkdownContent content={message.content} />
        )}

        {/* Action row — visible on hover */}
        {!message.isError && (
          <div className="flex items-center gap-3 mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <span className="font-mono text-[11px] text-stone">{message.timestamp}</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px] text-stone hover:text-ink transition-colors py-0.5 px-2 rounded-md hover:bg-sand/40 border border-transparent hover:border-line/60"
              title="Copy response"
            >
              {copied ? (
                <>
                  <CheckIcon className="w-3 h-3 text-claret" />
                  <span className="text-claret font-medium">Copied</span>
                </>
              ) : (
                <>
                  <CopyIcon className="w-3 h-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageRow = memo(MessageRowBase);
