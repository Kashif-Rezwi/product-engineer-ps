'use client';

interface ThinkingDotsProps {
  // Layout of the dot row, e.g. "flex items-center gap-1.5 py-2".
  className?: string;
}

// Three sequentially blinking dots shown while the model is thinking /
// the stream is waiting for its first chunk. Animation lives in globals.css.
export function ThinkingDots({ className = 'flex items-center gap-1.5' }: ThinkingDotsProps) {
  return (
    <span className={className}>
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </span>
  );
}
