import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy-to-clipboard state machine shared by the message and code-block copy
 * buttons. `copied` resets after `resetMs` so the label flips
 * "Copy" → "Copied" → "Copy" and the timer is cleaned up on unmount.
 */
export function useCopyToClipboard(resetMs = 1600) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).catch(() => {});
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), resetMs);
    },
    [resetMs],
  );

  return { copied, copy };
}
