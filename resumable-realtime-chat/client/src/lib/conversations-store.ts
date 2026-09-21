// localStorage-backed conversation list, exposed as a subscribable store
// so components can stay in sync via useSyncExternalStore — no manual
// refresh() calls needed (previously the source of stale-sidebar bugs).

export interface StoredConversation {
  id: string;
  title: string;
  lastMessage?: string;
  updatedAt: number;
}

const STORAGE_KEY = 'resumable_chat_conversations_v1';
const MAX_CONVERSATIONS = 20;

const EMPTY: StoredConversation[] = [];
const listeners = new Set<() => void>();

/* ─── Snapshot cache (useSyncExternalStore contract) ────────────────────────── */

// getSnapshot must return a stable reference until the store actually changes.
let snapshotCache: StoredConversation[] = EMPTY;
let snapshotDirty = true;

function readFromStorage(): StoredConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** Stable snapshot of the conversation list. */
export function getSnapshot(): StoredConversation[] {
  if (snapshotDirty) {
    snapshotCache = readFromStorage();
    snapshotDirty = false;
  }
  return snapshotCache;
}

/** SSR snapshot — nothing to show before hydration. */
export function getServerSnapshot(): StoredConversation[] {
  return EMPTY;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commitSnapshot(next: StoredConversation[]) {
  snapshotCache = next;
  snapshotDirty = false;
  listeners.forEach((listener) => listener());
}

/* ─── Public store API ──────────────────────────────────────────────────────── */

export function saveConversation(
  id: string,
  title?: string,
  lastMessage?: string,
): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getSnapshot();
    const now = Date.now();
    const existingIndex = existing.findIndex((c) => c.id === id);

    let updated: StoredConversation[];
    if (existingIndex >= 0) {
      const current = existing[existingIndex];
      updated = [
        {
          ...current,
          title: title || current.title,
          lastMessage: lastMessage !== undefined ? lastMessage : current.lastMessage,
          updatedAt: now,
        },
        ...existing.filter((c) => c.id !== id),
      ];
    } else {
      updated = [
        {
          id,
          title: title || `Conversation ${id.slice(0, 8)}`,
          lastMessage,
          updatedAt: now,
        },
        ...existing,
      ];
    }

    const trimmed = updated.slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    commitSnapshot(trimmed);
  } catch {
    // localStorage unavailable (quota / private mode) — keep last known snapshot.
  }
}

export function removeConversation(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const filtered = getSnapshot().filter((c) => c.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    commitSnapshot(filtered);
  } catch {
    // ignore
  }
}
