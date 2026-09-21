'use client';

// Shared Composer — used on both the home page (creates a new conversation) and on the conversation page (sends messages).
// Styled in the Caygnus tactile paper aesthetic with crisp warm borders, ink button with claret hover transition, and fluid sizing.

import React, { useEffect, useRef } from 'react';
import { APP_NAME } from '@/src/lib/config';
import { SendIcon } from './icons';
import { Spinner } from './Spinner';

const MAX_HEIGHT_PX = 200;
const DEFAULT_MIN_HEIGHT_PX = 56;

interface ComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  // Show a spinner instead of the send arrow
  sending?: boolean;
  minHeight?: string;
  autoFocus?: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = `Message ${APP_NAME}…`,
  sending = false,
  minHeight = '56px',
  autoFocus = false,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const parsedMin = parseInt(minHeight, 10) || DEFAULT_MIN_HEIGHT_PX;
    el.style.height = `${Math.max(parsedMin, Math.min(el.scrollHeight, MAX_HEIGHT_PX))}px`;
  }, [value, minHeight]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled && !sending) {
        onSubmit(value);
      }
    }
  }

  const canSend = !!value.trim() && !disabled && !sending;

  return (
    <div className="relative flex flex-col bg-paper-2 rounded-2xl border border-line focus-within:border-claret focus-within:ring-2 focus-within:ring-claret/15 transition-all duration-[var(--duration-fast)] shadow-xs">
      <textarea
        ref={textareaRef}
        id="message-input"
        aria-label="Message input"
        value={value}
        rows={1}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full resize-none bg-transparent px-4 pt-3.5 pb-12 text-base pointer-fine:text-[0.9375rem] leading-relaxed text-ink placeholder:text-stone outline-none disabled:opacity-40"
        style={{ minHeight, maxHeight: `${MAX_HEIGHT_PX}px` }}
      />

      {/* Bottom toolbar */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2">
        {/* Send / spinner */}
        <button
          id="send-button"
          type="button"
          onClick={() => canSend && onSubmit(value)}
          disabled={!canSend}
          aria-label="Send message"
          className="w-8 h-8 flex items-center justify-center rounded-full bg-ink text-paper transition-all duration-[var(--duration-fast)] ease-kiln-inout hover:bg-claret active:scale-[0.96] shadow-xs disabled:bg-sand disabled:text-disabled disabled:cursor-not-allowed"
        >
          {sending ? (
            <Spinner className="w-3.5 h-3.5" trackClassName="border-paper/30 border-t-paper" />
          ) : (
            <SendIcon className="w-4 h-4" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
