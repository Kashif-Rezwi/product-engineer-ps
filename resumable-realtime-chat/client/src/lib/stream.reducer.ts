import { ConnectionStatus } from './types';

// ─── State Shape ──────────────────────────────────────────────────────────────

export interface StreamState {
  status: ConnectionStatus;
  runId: string | null;
  lastEventId: string | null;
  // Chunks keyed by position — guarantees ordered, deduplicated output.
  chunks: Record<number, string>;
  // Assembled text from all chunks in position order.
  text: string;
  reconnectAttempt: number;
  error: string | null;
  // True once the completed text has been committed to message history.
  committed: boolean;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type StreamAction =
  | { type: 'CONNECT_START'; runId: string }
  | { type: 'RECONNECT_ATTEMPT'; attempt: number }
  | { type: 'CHUNK_RECEIVED'; id: string; position: number; text: string }
  | { type: 'STREAM_COMPLETED'; id?: string }
  | { type: 'STREAM_FAILED'; error: string }
  | { type: 'MARK_COMMITTED' }
  | { type: 'RESET' };

// ─── Initial State ────────────────────────────────────────────────────────────

export const initialStreamState: StreamState = {
  status: 'disconnected',
  runId: null,
  lastEventId: null,
  chunks: {},
  text: '',
  reconnectAttempt: 0,
  error: null,
  committed: false,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assembles text from a position-keyed chunk map.
 *
 * For the common case (sequential in-order delivery), chunks arrive as
 * position 0, 1, 2, ... N so we can just append. We only fall back to the
 * full sort+join when a gap-fill occurs (reconnection replay with cursor).
 */
function assembleText(
  existingText: string,
  existingChunkCount: number,
  chunks: Record<number, string>,
  newPosition: number,
  newText: string,
): string {
  // Fast path: new chunk is the next sequential position — just append.
  if (newPosition === existingChunkCount) {
    return existingText + newText;
  }
  // Slow path: out-of-order chunk (gap-fill after reconnect) — sort & rebuild.
  return Object.keys(chunks)
    .map(Number)
    .sort((a, b) => a - b)
    .map((pos) => chunks[pos])
    .join('');
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function streamReducer(
  state: StreamState,
  action: StreamAction,
): StreamState {
  switch (action.type) {
    case 'CONNECT_START':
      // Reset all stream state for a new run
      return { ...initialStreamState, status: 'connected', runId: action.runId };

    case 'RECONNECT_ATTEMPT':
      return { ...state, status: 'reconnecting', reconnectAttempt: action.attempt };

    case 'CHUNK_RECEIVED': {
      // Position-keyed deduplication: if the exact text at this position
      // is already stored, only update the cursor — don't reassemble.
      if (state.chunks[action.position] === action.text) {
        return {
          ...state,
          status: 'connected',
          lastEventId: action.id || state.lastEventId,
          reconnectAttempt: 0,
        };
      }

      const updatedChunks = { ...state.chunks, [action.position]: action.text };
      const existingChunkCount = Object.keys(state.chunks).length;

      return {
        ...state,
        status: 'connected',
        lastEventId: action.id || state.lastEventId,
        chunks: updatedChunks,
        text: assembleText(
          state.text,
          existingChunkCount,
          updatedChunks,
          action.position,
          action.text,
        ),
        reconnectAttempt: 0,
      };
    }

    case 'STREAM_COMPLETED':
      return {
        ...state,
        status: 'completed',
        lastEventId: action.id || state.lastEventId,
        reconnectAttempt: 0,
      };

    case 'STREAM_FAILED':
      return { ...state, status: 'failed', error: action.error, reconnectAttempt: 0 };

    case 'MARK_COMMITTED':
      return { ...state, committed: true };

    case 'RESET':
      return initialStreamState;

    default:
      return state;
  }
}
