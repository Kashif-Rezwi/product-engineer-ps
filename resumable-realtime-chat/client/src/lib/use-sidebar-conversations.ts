import { useState, useEffect, useCallback } from 'react';
import {
  getStoredConversations,
  removeConversation,
  StoredConversation,
} from './conversations-store';

interface UseSidebarConversationsReturn {
  conversations: StoredConversation[];
  handleDelete: (id: string) => void;
  /** Call this after saving a new conversation to sync sidebar state. */
  refresh: () => void;
}

/**
 * Shared hook that manages sidebar conversation list state.
 *
 * Centralises the localStorage read + useState + handleDelete pattern
 * that was duplicated across the home page and conversation page.
 *
 * `refreshKey` triggers a re-read from localStorage — pass `convId`
 * so the sidebar refreshes when navigating between conversations.
 */
export function useSidebarConversations(
  refreshKey?: string,
): UseSidebarConversationsReturn {
  const [conversations, setConversations] = useState<StoredConversation[]>([]);

  useEffect(() => {
    setConversations(getStoredConversations());
  }, [refreshKey]);

  const handleDelete = useCallback((id: string) => {
    setConversations(removeConversation(id));
  }, []);

  const refresh = useCallback(() => {
    setConversations(getStoredConversations());
  }, []);

  return { conversations, handleDelete, refresh };
}
