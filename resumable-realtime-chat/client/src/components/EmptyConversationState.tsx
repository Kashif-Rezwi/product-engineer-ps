'use client';

import React from 'react';
import { AppLogo } from './AppLogo';
import { Composer } from './Composer';

interface EmptyConversationStateProps {
  heading: string;
  placeholder: string;
  input: string;
  onInputChange: (v: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  sending?: boolean;
}

// Centered empty state (greeting + centered composer) shown when a
// conversation has no messages yet. Extracted from the conversation page.
export function EmptyConversationState({
  heading,
  placeholder,
  input,
  onInputChange,
  onSubmit,
  disabled = false,
  sending = false,
}: EmptyConversationStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center-safe px-4 pt-8 pb-18 sm:pb-24 select-none animate-fadeIn overflow-y-auto">
      <div className="w-full max-w-2xl flex flex-col items-center">
        {/* Stylistic & bold headline */}
        <div className="flex items-center justify-center gap-3.5 sm:gap-4 mb-7 sm:mb-8">
          <AppLogo size="md" className="shadow-xs shrink-0" />
          <h2 className="font-display font-normal text-[26px] sm:text-3xl md:text-[38px] lg:text-[40px] text-ink tracking-tight leading-none text-center">
            {heading}
          </h2>
        </div>

        {/* Centered Composer */}
        <div className="w-full">
          <Composer
            value={input}
            onChange={onInputChange}
            onSubmit={onSubmit}
            disabled={disabled}
            sending={sending}
            minHeight="84px"
            autoFocus={true}
            placeholder={placeholder}
          />
          <p className="mt-3 text-center text-[11px] text-stone font-mono tracking-wide select-none">
            Enter ↵ to send · Shift+Enter for newline · Resumes from cursor on disconnect
          </p>
        </div>
      </div>
    </div>
  );
}
