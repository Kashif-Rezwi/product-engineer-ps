'use client';

import React from 'react';
import { AppLogo } from './AppLogo';

// The circular avatar shown next to every AI message.
// Styled with the unified AppLogo for complete brand consistency.
export function AiAvatar() {
  return <AppLogo size="avatar" className="mt-0.5" />;
}
