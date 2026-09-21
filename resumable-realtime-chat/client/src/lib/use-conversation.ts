import { useState, useCallback, useEffect } from 'react';
import { ChatMessage } from './types';
import { API_BASE_URL } from './config';

function makeTimestamp(isoString?: string): string {
  const date = isoString ? new Date(isoString) : new Date();
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Shape of a message returned by GET /conversations/:id
interface ServerMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  runs?: Array<{
    id: string;
    status: string;
    error?: string | null;
    traceLog?: Array<{ type: string; position?: number; text?: string }> | null;
  }>;
}

interface ServerConversation {
  id: string;
  messages: ServerMessage[];
}

interface UseConversationReturn {
  conversationId: string;
  messages: ChatMessage[];
  isReady: boolean;
  latestRunningRunId: string | null;
  sendMessage: (content: string) => Promise<{ runId: string }>;
  commitAssistantMessage: (runId: string, text: string, isError?: boolean) => void;
}

export function useConversation(conversationId: string): UseConversationReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [latestRunningRunId, setLatestRunningRunId] = useState<string | null>(null);

  // Hydrate existing conversation history on mount
  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      try {
        const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}`);
        if (!res.ok) {
          console.warn('[useConversation] Could not load history:', res.status);
          return;
        }
        const data: ServerConversation = await res.json();

        const hydrated: ChatMessage[] = [];
        let detectedRunningRunId: string | null = null;

        for (let i = 0; i < data.messages.length; i++) {
          const msg = data.messages[i];
          // User message bubble
          hydrated.push({
            id: msg.id,
            role: 'user',
            content: msg.content,
            timestamp: makeTimestamp(msg.createdAt),
          });

          // Check the latest run for this message
          const latestRun = msg.runs?.[0];
          if (latestRun) {
            if (latestRun.status === 'COMPLETED' && latestRun.traceLog) {
              const textChunks = latestRun.traceLog
                .filter((e) => e.type === 'text_chunk' && typeof e.text === 'string')
                .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
                .map((e) => e.text ?? '');

              const fullText = textChunks.join('');
              if (fullText) {
                hydrated.push({
                  id: `ai-${latestRun.id}`,
                  role: 'assistant',
                  content: fullText,
                  runId: latestRun.id,
                  timestamp: makeTimestamp(msg.createdAt),
                });
              }
            } else if (latestRun.status === 'FAILED') {
              const errorText = latestRun.error || 'The response could not be generated.';
              hydrated.push({
                id: `ai-${latestRun.id}`,
                role: 'assistant',
                content: errorText,
                runId: latestRun.id,
                timestamp: makeTimestamp(msg.createdAt),
                isError: true,
              });
            } else if (
              (latestRun.status === 'RUNNING' || latestRun.status === 'QUEUED') &&
              i === data.messages.length - 1
            ) {
              // Only detect active run if it's on the latest message
              detectedRunningRunId = latestRun.id;
            }
          }
        }

        if (!cancelled) {
          setMessages(hydrated);
          if (detectedRunningRunId) {
            setLatestRunningRunId(detectedRunningRunId);
          }
        }
      } catch (err) {
        console.warn('[useConversation] History load error:', err);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // POST a user message to the server.
  // Optimistically appends the user bubble and returns the new runId.
  const sendMessage = useCallback(
    async (content: string): Promise<{ runId: string }> => {
      // Optimistic user bubble
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content,
          timestamp: makeTimestamp(),
        },
      ]);

      const res = await fetch(`${API_BASE_URL}/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error(`Failed to send: HTTP ${res.status}`);

      const { runId } = await res.json();
      return { runId };
    },
    [conversationId]
  );


  // Commit the completed AI response to message history.
  // Idempotent — guarded by runId to prevent double-append.
  const commitAssistantMessage = useCallback(
    (runId: string, text: string, isError = false) => {
      setMessages((prev) => {
        if (prev.some((m) => m.runId === runId)) return prev;
        return [
          ...prev,
          {
            id: `ai-${runId}`,
            role: 'assistant',
            content: text,
            runId,
            timestamp: makeTimestamp(),
            isError,
          },
        ];
      });
    },
    []
  );

  return {
    conversationId,
    messages,
    isReady,
    latestRunningRunId,
    sendMessage,
    commitAssistantMessage,
  };
}
