// Single source of truth for conversation title generation & formatting.
// Used by useCreateConversation, the conversation page, and the Sidebar —
// previously this logic was duplicated (with drifting rules) across all three.

export const TITLE_MAX_LENGTH = 48;
export const DEFAULT_TITLE = 'New conversation';

/** Truncates long text to a sidebar-friendly title, appending an ellipsis. */
export function truncateTitle(text: string, maxLength = TITLE_MAX_LENGTH): string {
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trimEnd()}...`
    : text;
}

/** Normalizes stored titles by collapsing whitespace before trailing ellipses. */
export function cleanTitle(title?: string): string {
  if (!title) return DEFAULT_TITLE;
  return title.replace(/\s+(\.{3}|…)/g, '...').trim();
}

/**
 * Formats the title shown in the conversation header.
 * Prefers the stored title; falls back to truncating the first user message.
 */
export function formatConversationTitle(
  rawTitle: string,
  firstUserMessage?: string,
): string {
  if (!rawTitle || rawTitle === DEFAULT_TITLE) return rawTitle;
  if (firstUserMessage && firstUserMessage.length > TITLE_MAX_LENGTH) {
    return `${firstUserMessage.slice(0, TITLE_MAX_LENGTH).trimEnd()}...`;
  }
  if (rawTitle.endsWith('...') || rawTitle.endsWith('…')) return rawTitle;
  if (rawTitle.length >= 45) {
    return `${rawTitle.slice(0, 45).trimEnd()}...`;
  }
  return rawTitle;
}
