'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyIcon, CheckIcon } from './icons';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
}

// Fenced code block styled in Caygnus dark charcoal paper palette with warm sand borders.
function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const langMatch = /language-(\w+)/.exec(className || '');
  const language = langMatch ? langMatch[1] : '';
  const rawCode = String(children).replace(/\n$/, '');

  const handleCopy = () => {
    navigator.clipboard.writeText(rawCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="my-4 rounded-xl border border-[#352f26] bg-[#1a1712] overflow-hidden text-sm font-mono shadow-xs">
      {/* Code header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#352f26] bg-[#24201a] select-none">
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
        <pre className="text-[13px] leading-relaxed text-[#f7f4ed] font-mono m-0 p-0 bg-transparent border-0">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}

export function MarkdownContent({ content, isStreaming = false }: MarkdownContentProps) {
  return (
    <div className="text-[0.9375rem] leading-relaxed text-ink break-words font-sans">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Table with clean border, header, alternating hover, and overflow container
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-line bg-paper-2 shadow-xs">
              <table className="w-full text-left text-sm border-collapse min-w-[480px]">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-sand/35 border-b border-line text-[12px] font-semibold text-ink uppercase tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-line/60">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-sand/20">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 font-semibold text-ink font-sans">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-muted leading-relaxed align-top font-sans">
              {children}
            </td>
          ),

          // Code blocks & inline code
          pre: ({ children }) => {
            const childArray = React.Children.toArray(children);
            const codeEl = childArray[0] as React.ReactElement<any>;
            if (codeEl && codeEl.props) {
              return (
                <CodeBlock className={codeEl.props.className}>
                  {codeEl.props.children}
                </CodeBlock>
              );
            }
            return (
              <pre className="my-4 overflow-x-auto p-4 rounded-xl bg-[#1a1712] border border-[#352f26] text-paper">
                {children}
              </pre>
            );
          },
          code: ({ children, className }) => {
            const isBlock = className && /language-/.test(className);
            if (isBlock) {
              return <code className={className}>{children}</code>;
            }
            return (
              <code className="rounded-md bg-sand/50 px-1.5 py-0.5 font-mono text-[0.85em] text-ink border border-line whitespace-nowrap">
                {children}
              </code>
            );
          },

          // Typography
          p: ({ children }) => (
            <p className="leading-relaxed mb-3 last:mb-0 text-ink">
              {children}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-display font-medium text-ink mt-5 mb-2.5 tracking-[-0.02em]">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-display font-medium text-ink mt-4 mb-2 tracking-[-0.015em]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-display font-medium text-ink mt-3.5 mb-1.5 tracking-[-0.01em]">
              {children}
            </h3>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2.5 space-y-1 text-ink marker:text-claret">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2.5 space-y-1 text-ink marker:text-muted">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-claret pl-4 py-1 my-3 text-muted italic bg-sand/20 rounded-r-lg">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-claret hover:underline decoration-claret/50 underline-offset-3 font-medium transition-opacity hover:opacity-80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-ink">{children}</strong>
          ),
          hr: () => <hr className="border-line my-5" />,
        }}
      >
        {content}
      </ReactMarkdown>

      {/* 3 sequentially animated dots while streaming */}
      {isStreaming && (
        <span className="inline-flex items-center gap-1 ml-1.5 align-middle select-none">
          <span className="thinking-dot" />
          <span className="thinking-dot" />
          <span className="thinking-dot" />
        </span>
      )}
    </div>
  );
}
