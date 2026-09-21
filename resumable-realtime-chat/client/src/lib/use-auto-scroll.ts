import { useCallback, useRef } from 'react';

const NEAR_BOTTOM_THRESHOLD_PX = 150;

/**
 * Scroll-position tracking for the chat thread.
 * Keeps the view pinned to the latest message unless the user has scrolled
 * up to read the backlog (within NEAR_BOTTOM_THRESHOLD_PX counts as "near").
 *
 * Returns refs to attach: `scrollContainerRef` (scrollable div) and
 * `bottomRef` (sentinel div rendered after the last message).
 */
export function useAutoScroll() {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);

  // Attach to the scrollable container — keeps the flag fresh on every scroll.
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
  }, []);

  /**
   * Scrolls the thread to the bottom sentinel — instantly while streaming
   * (no janky easing on every chunk), smoothly for new committed messages.
   * No-ops when the user is reading the backlog.
   */
  const scrollToBottom = useCallback((instant: boolean) => {
    if (!isNearBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth' });
  }, []);

  return { scrollContainerRef, bottomRef, handleScroll, scrollToBottom };
}
