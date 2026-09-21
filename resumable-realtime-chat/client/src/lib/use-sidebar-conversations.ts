'use client';

import { useCallback, useSyncExternalStore } from 'react';
import {
  getSnapshot,
  getServerSnapshot,
  subscribe,
  removeConversation,
  StoredConversation,
} from './conversations-store';

interface UseSidebarConversationsReturn {
  conversations: StoredConversation[];
  handleDelete: (id: string) => void;
}

/**
 * Sidebar conversation list, kept automatically in sync with the localStorage
 * store via useSyncExternalStore — every saveConversation/removeConversation
 * from anywhere in the app updates all mounted sidebars. No manual refresh().
 */
export function useSidebarConversations(): UseSidebarConversationsReturn {
  const conversations = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const handleDelete = useCallback((id: string) => {
    removeConversation(id);
  }, []);

  return { conversations, handleDelete };
}
