'use client';

import React from 'react';
import { SparkleIcon } from './icons';

export interface AppLogoProps {
  size?: 'sm' | 'avatar' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: {
    container: 'w-6 h-6',
    icon: 'w-3.5 h-3.5',
  },
  avatar: {
    container: 'w-7 h-7',
    icon: 'w-4 h-4',
  },
  md: {
    container: 'w-10 h-10',
    icon: 'w-5.5 h-5.5',
  },
  lg: {
    container: 'w-14 h-14',
    icon: 'w-8 h-8',
  },
};

// Standardized Official App Logo mark. Used consistently across Sidebar, Hero section, Conversation headers, Empty states, and AI Assistant avatars.
export function AppLogo({ size = 'sm', className = '' }: AppLogoProps) {
  const cfg = SIZE_MAP[size];

  return (
    <div
      className={`shrink-0 rounded-full bg-ink flex items-center justify-center shadow-xs ${cfg.container} ${className}`}
      aria-hidden="true"
    >
      <SparkleIcon className={`${cfg.icon} text-paper`} />
    </div>
  );
}
