'use client';

import React from 'react';

interface StarterGridProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const STARTERS = [
  {
    heading: 'How does SSE resumption work?',
    sub: 'Explain the Last-Event-ID cursor mechanism',
  },
  {
    heading: 'SSE vs WebSockets',
    sub: 'Trade-offs for real-time AI streaming',
  },
  {
    heading: 'Draft a Redis Streams pipeline',
    sub: 'Resilient event ingestion architecture',
  },
  {
    heading: 'Explain quantum computing',
    sub: 'Simple 3-sentence breakdown',
  },
];

// Starter prompt cards on the home page — clicking one starts a new
// conversation with the card's heading as the first message.
export function StarterGrid({ onSelect, disabled = false }: StarterGridProps) {
  return (
    <div className="mt-5 w-full max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {STARTERS.map((s) => (
        <button
          key={s.heading}
          onClick={() => onSelect(s.heading)}
          disabled={disabled}
          className="flex flex-col items-start text-left px-4 py-3.5 bg-paper-2 hover:bg-sand/35 border border-line hover:border-ink/40 rounded-2xl transition-all duration-200 ease-kiln shadow-xs group disabled:opacity-50"
        >
          <p className="text-sm font-medium text-ink leading-snug group-hover:text-claret transition-colors">
            {s.heading}
          </p>
          <p className="text-xs text-muted mt-1 leading-snug">{s.sub}</p>
        </button>
      ))}
    </div>
  );
}
