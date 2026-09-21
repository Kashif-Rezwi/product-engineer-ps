import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE_URL } from './config';
import { saveConversation } from './conversations-store';

interface UseCreateConversationReturn {
  isCreating: boolean;
  error: string | null;
  createConversation: (initialPrompt?: string) => Promise<void>;
  clearError: () => void;
}

// Shared hook that encapsulates the "create new conversation" flow: POST /conversations → save to localStorage → navigate.
// Used by both the home page and the conversation page's "New chat" button to eliminate duplicated logic.
export function useCreateConversation(): UseCreateConversationReturn {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createConversation = useCallback(
    async (initialPrompt?: string) => {
      if (isCreating) return;
      setIsCreating(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE_URL}/conversations`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        const data = await res.json();

        const title = initialPrompt
          ? initialPrompt.length > 48
            ? initialPrompt.slice(0, 48).trimEnd() + '...'
            : initialPrompt
          : 'New conversation';

        saveConversation(data.id, title, initialPrompt || undefined);

        const url = initialPrompt
          ? `/conversations/${data.id}?prompt=${encodeURIComponent(initialPrompt)}`
          : `/conversations/${data.id}`;

        router.push(url);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to connect');
        setIsCreating(false);
      }
    },
    [isCreating, router],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isCreating, error, createConversation, clearError };
}
