'use client';

import React from 'react';
import { AlertCircleIcon } from './icons';

interface ErrorNoticeProps {
  /** Optional bold prefix, e.g. "Stream failed — ". */
  title?: string;
  children: React.ReactNode;
  /** Extra layout classes on top of the base danger styles (margins, width, padding). */
  className?: string;
  /** Defaults to 'w-4 h-4 shrink-0'. */
  iconClassName?: string;
  /** Vertical alignment of the icon against the content. */
  align?: 'center' | 'start';
}

// Shared danger notice box used for stream failures, send errors, and API errors.
export function ErrorNotice({
  title,
  children,
  className = '',
  iconClassName = 'w-4 h-4 shrink-0',
  align = 'center',
}: ErrorNoticeProps) {
  return (
    <div
      className={`flex ${align === 'start' ? 'items-start' : 'items-center'} gap-2.5 text-sm text-error bg-error/10 border border-error/25 rounded-xl px-4 animate-fadeIn ${className}`}
    >
      <AlertCircleIcon className={iconClassName} />
      <div>
        {title && <span className="font-semibold">{title}</span>}
        {children}
      </div>
    </div>
  );
}
