// Single source of truth for API base URL and app-wide constants.
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const APP_NAME = 'ResumableChat';

// Maximum SSE reconnection attempts before a stream is declared failed.
// Shared by the stream hook (retry loop) and the StatusBadge ("Retry n/3").
export const MAX_RETRY_ATTEMPTS = 3;
