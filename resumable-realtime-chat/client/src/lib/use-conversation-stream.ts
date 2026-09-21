import { useReducer, useRef, useCallback, useEffect } from 'react';
import { streamReducer, initialStreamState } from './stream.reducer';
import { parseSSEStream } from './sse';
import { ParsedSSEMessage } from './types';
import { API_BASE_URL } from './config';

const RETRY_DELAYS = [500, 1000, 2000]; // ms
const MAX_RETRY_ATTEMPTS = 3;

// Public API surface exposed to consumers. Internal fields (chunks, lastEventId) are intentionally not exposed.
export interface ConversationStreamState {
  status: 'disconnected' | 'connected' | 'reconnecting' | 'completed' | 'failed';
  runId: string | null;
  text: string;
  reconnectAttempt: number;
  error: string | null;
  committed: boolean;
}

export function useConversationStream() {
  const [state, dispatch] = useReducer(streamReducer, initialStreamState);

  const abortControllerRef = useRef<AbortController | null>(null);
  const seenEventIdsRef    = useRef<Set<string>>(new Set());
  // Mutable ref — updated immediately on each event, never 1 render behind
  const lastEventIdRef     = useRef<string | null>(null);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    stopStream();
    seenEventIdsRef.current.clear();
    lastEventIdRef.current = null;
    dispatch({ type: 'RESET' });
  }, [stopStream]);

  const markCommitted = useCallback(() => {
    dispatch({ type: 'MARK_COMMITTED' });
  }, []);

  const startStream = useCallback(
    (conversationId: string, runId: string) => {
      stopStream();

      // Reset per-run tracking
      seenEventIdsRef.current.clear();
      lastEventIdRef.current = null;

      dispatch({ type: 'CONNECT_START', runId });

      const controller = new AbortController();
      abortControllerRef.current = controller;

      async function attempt(attemptIndex: number) {
        if (controller.signal.aborted) return;

        let receivedTerminal = false;

        try {
          // Build URL — include cursor as query param for server fallback
          const cursor = lastEventIdRef.current;
          const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
          const url = `${API_BASE_URL}/conversations/${conversationId}/runs/${runId}/stream${qs}`;

          const headers: Record<string, string> = { Accept: 'text/event-stream' };
          if (cursor) headers['Last-Event-ID'] = cursor;

          const response = await fetch(url, { headers, signal: controller.signal });

          // Hard failures — do not retry
          if (response.status === 400 || response.status === 404) {
            const body = await response.json().catch(() => ({}));
            dispatch({
              type: 'STREAM_FAILED',
              error: body.message || `Request failed: HTTP ${response.status}`,
            });
            return;
          }

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (!response.body) throw new Error('Empty response body');

          const reader = response.body.getReader();

          await parseSSEStream(
            reader,
            (msg: ParsedSSEMessage) => {
              if (controller.signal.aborted) return;

              // Stream-ID–level deduplication (guards against replay/live overlap)
              if (msg.id) {
                if (seenEventIdsRef.current.has(msg.id)) return;
                seenEventIdsRef.current.add(msg.id);
                // Update the ref immediately — no useEffect lag
                lastEventIdRef.current = msg.id;
              }

              const { event } = msg;

              if (event.type === 'text_chunk') {
                dispatch({ type: 'CHUNK_RECEIVED', id: msg.id, position: event.position, text: event.text });
              } else if (event.type === 'completed') {
                receivedTerminal = true;
                dispatch({ type: 'STREAM_COMPLETED', id: msg.id });
              } else if (event.type === 'failed') {
                receivedTerminal = true;
                dispatch({ type: 'STREAM_FAILED', error: event.message || 'Generation failed' });
              }
            },
            controller.signal,
          );

          // Stream ended cleanly
          if (receivedTerminal || controller.signal.aborted) return;

          // Unexpected close without a terminal event — treat as a disconnection
          throw new Error('Connection closed without terminal event');
        } catch (err: unknown) {
          if (controller.signal.aborted) return;

          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[stream] Disconnection (attempt ${attemptIndex + 1}/${MAX_RETRY_ATTEMPTS}):`, message);

          if (attemptIndex < MAX_RETRY_ATTEMPTS) {
            const nextAttempt = attemptIndex + 1;
            dispatch({ type: 'RECONNECT_ATTEMPT', attempt: nextAttempt });

            const delay = RETRY_DELAYS[attemptIndex] ?? RETRY_DELAYS.at(-1)!;
            setTimeout(() => {
              if (!controller.signal.aborted) attempt(nextAttempt);
            }, delay);
          } else {
            dispatch({ type: 'STREAM_FAILED', error: 'Connection lost after 3 reconnection attempts.' });
          }
        }
      }

      attempt(0);
    },
    [stopStream],
  );

  // Cleanup on unmount
  useEffect(() => () => stopStream(), [stopStream]);

  // Return only the curated public API — internal reducer fields (chunks, lastEventId)
  // are implementation details that consumers should never access directly.
  const publicState: ConversationStreamState = {
    status:           state.status,
    runId:            state.runId,
    text:             state.text,
    reconnectAttempt: state.reconnectAttempt,
    error:            state.error,
    committed:        state.committed,
  };

  return { ...publicState, startStream, stopStream, reset, markCommitted };
}
