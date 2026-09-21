'use client';

import React, { memo, useCallback } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyIcon, CheckIcon } from './icons';
import { ThinkingDots } from './ThinkingDots';
import { useCopyToClipboard } from '@/src/lib/use-copy-to-clipboard';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

// Fenced code block styled in Caygnus dark charcoal paper palette with warm sand borders.
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const { copied, copy } = useCopyToClipboard();

  const langMatch = /language-(\w+)/.exec(className || '');
  const language = langMatch ? langMatch[1] : '';
  const rawCode = String(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    copy(rawCode);
  }, [copy, rawCode]);

  return (
    <div className="my-4 rounded-xl border border-code-border bg-code-bg overflow-hidden text-sm font-mono shadow-xs">
      {/* Code header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-code-border bg-code-header select-none">
        <span className="text-[11px] text-sand/80 font-mono uppercase tracking-[0.12em] font-medium">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-stone hover:text-paper transition-colors py-0.5 px-2 rounded hover:bg-sand/10"
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3 h-3 text-claret" />
              <span className="text-claret text-[11px] font-medium">Copied</span>
            </>
          ) : (
            <>
              <CopyIcon className="w-3 h-3" />
              <span className="text-[11px]">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="p-4 overflow-x-auto scroll-y">
        <pre className="text-[13px] leading-relaxed text-code-text font-mono m-0 p-0 bg-transparent border-0">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

// Component map hoisted to module scope: the override closures are static, so
// rebuilding them on every render (e.g. every streaming chunk) was pure waste.
const MARKDOWN_COMPONENTS: Components = {
  // Table with clean border, header, alternating hover, and overflow container
  table: ({ children }) => (
    <div className="my-4 w-full overflow-x-auto rounded-xl border border-line bg-paper-2 shadow-xs">
      <table className="w-full text-left text-sm border-collapse min-w-[480px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="bg-sand/35 border-b border-line text-[12px] font-semibold text-ink uppercase tracking-wider">
      {children}
    </thead>
  ),
  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="divide-y divide-line/60">{children}</tbody>
  ),
  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-sand/20">{children}</tr>
  ),
  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-3 font-semibold text-ink font-sans tracking-wider">{children}</th>
  ),
  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-3 text-muted">{children}</td>
  ),

  // Code blocks
  pre: ({ children }: { children?: React.ReactNode }) => {
    const childArray = React.Children.toArray(children);
    const codeEl = childArray[0] as
      | React.ReactElement<{ className?: string; children?: React.ReactNode }>
      | undefined;
    if (codeEl && codeEl.props) {
      return (
        <CodeBlock className={codeEl.props.className}>
          {codeEl.props.children}
        </CodeBlock>
      );
    }
    return (
      <pre className="my-4 overflow-x-auto p-4 rounded-xl bg-code-bg border border-code-border text-paper">
        {children}
      </pre>
    );
  },
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className && /language-/.test(className);
    if (isBlock) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded-md bg-sand/50 px-1.5 py-0.5 font-mono text-[0.85em] text-ink border border-line break-words">
        {children}
      </code>
    );
  },

  // Typography
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="leading-relaxed mb-3 last:mb-0 text-ink">{children}</p>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="text-xl font-display font-medium text-ink mt-5 mb-2.5 tracking-[-0.02em]">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-lg font-display font-medium text-ink mt-4 mb-2 tracking-[-0.015em]">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-base font-display font-medium text-ink mt-3.5 mb-1.5 tracking-[-0.01em]">
      {children}
    </h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 my-2.5 space-y-1 text-ink marker:text-claret">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 my-2.5 space-y-1 text-ink marker:text-muted">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="leading-relaxed pl-1">{children}</li>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-claret pl-4 py-1 my-3 text-muted italic bg-sand/20 rounded-r-lg">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-claret hover:underline decoration-claret/50 underline-offset-3 font-medium transition-opacity hover:opacity-80"
    >
      {children}
    </a>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  hr: () => <hr className="border-line my-5" />,
};

// Memoized: avoids re-parsing committed messages on unrelated parent
// re-renders (e.g. sidebar toggles, input keystrokes in the composer).
function MarkdownContentBase({ content, isStreaming = false }: MarkdownContentProps) {
  return (
    <div className="text-[0.9375rem] leading-relaxed text-ink break-words font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={MARKDOWN_COMPONENTS}
      >
        {content}
      </ReactMarkdown>

      {/* 3 sequentially animated dots while streaming */}
      {isStreaming && (
        <ThinkingDots className="inline-flex items-center gap-1 ml-1.5 align-middle select-none" />
      )}
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentBase);

