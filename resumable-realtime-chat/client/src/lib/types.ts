// Canonical client-side type definitions.
// Single source of truth — imported by sse.ts, stream.reducer.ts, use-conversation-stream.ts, use-conversation.ts, and page.tsx.

// ─── SSE Wire Event Types ────────────────────────────────────────────────────

export interface TextChunkEvent {
  type: 'text_chunk';
  position: number;
  text: string;
}

export interface CompletedEvent {
  type: 'completed';
  position: number;
}

export interface FailedEvent {
  type: 'failed';
  message: string;
}

export type RunEvent = TextChunkEvent | CompletedEvent | FailedEvent;

// ─── SSE Parser Output ───────────────────────────────────────────────────────

export interface ParsedSSEMessage {
  id: string;
  event: RunEvent;
}

// ─── Connection State Machine ────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'reconnecting'
  | 'completed'
  | 'failed';

// ─── Chat Message (committed history) ───────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  runId?: string;
  timestamp: string;
  isError?: boolean;
}
