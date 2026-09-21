'use client';

// ChatIcon — Re-exports or renders the sleek modern AI Sparkle icon.
// Maintains backwards compatibility with any component importing ChatIcon.
import React from 'react';
import { SparkleIcon, IconProps } from './icons';

export function ChatIcon(props: IconProps) {
  return <SparkleIcon {...props} />;
}
