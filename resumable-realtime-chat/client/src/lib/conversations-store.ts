export interface StoredConversation {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: number;
}

const STORAGE_KEY = 'resumable_chat_conversations_v1';
const MAX_CONVERSATIONS = 20;

export function getStoredConversations(): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveConversation(
  id: string,
  title?: string,
  lastMessage?: string
): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = getStoredConversations();
    const now = Date.now();
    const existingIndex = existing.findIndex((c) => c.id === id);

    let updated: StoredConversation[];
    if (existingIndex >= 0) {
      const current = existing[existingIndex];
      const updatedItem: StoredConversation = {
        ...current,
        title: title || current.title,
        lastMessage: lastMessage !== undefined ? lastMessage : current.lastMessage,
        updatedAt: now,
      };
      updated = [
        updatedItem,
        ...existing.filter((c) => c.id !== id),
      ];
    } else {
      const newItem: StoredConversation = {
        id,
        title: title || `Conversation ${id.slice(0, 8)}`,
        lastMessage,
        updatedAt: now,
      };
      updated = [newItem, ...existing];
    }

    const trimmed = updated.slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [];
  }
}

export function removeConversation(id: string): StoredConversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const existing = getStoredConversations();
    const filtered = existing.filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return filtered;
  } catch {
    return [];
  }
}
