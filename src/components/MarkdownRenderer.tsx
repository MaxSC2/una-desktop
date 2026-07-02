/**
 * MarkdownRenderer — рендеринг markdown с code blocks, lists, tables, links.
 *
 * Использует react-markdown + remark-gfm.
 * Code blocks рендерятся через CodeBlock компонент с syntax highlighting.
 */

'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks (```...```)
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');

            if (!inline && match) {
              return <CodeBlock code={code} language={match[1]} />;
            }

            if (!inline && code.includes('\n')) {
              // Multi-line code без указания языка
              return <CodeBlock code={code} language="text" />;
            }

            // Inline code
            return (
              <code
                className="bg-slate-700/40 text-una-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono"
                {...props}
              >
                {children}
              </code>
            );
          },

          // Заголовки
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-una-100 mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-una-100 mt-3 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-una-200 mt-3 mb-1">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold text-slate-200 mt-2 mb-1">{children}</h4>
          ),

          // Параграфы
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,

          // Списки
          ul: ({ children }) => (
            <ul className="my-2 space-y-1 list-disc list-inside text-slate-200">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 space-y-1 list-decimal list-inside text-slate-200">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,

          // Links
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-una-400 hover:text-una-300 underline"
              onClick={(e) => {
                e.preventDefault();
                if (href) {
                  window.una?.shell?.open?.(href).catch(() => {
                    window.open(href, '_blank', 'noopener,noreferrer');
                  });
                }
              }}
            >
              {children}
            </a>
          ),

          // Bold/Italic
          strong: ({ children }) => (
            <strong className="font-bold text-una-100">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-slate-300">{children}</em>,

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-una-500/50 pl-3 my-2 italic text-slate-400">
              {children}
            </blockquote>
          ),

          // Table
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="min-w-full border-collapse border border-slate-700/60 text-sm">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-800/60">{children}</thead>,
          th: ({ children }) => (
            <th className="border border-slate-700/60 px-3 py-1.5 text-left font-mono text-una-300">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-slate-700/60 px-3 py-1.5 text-slate-200">{children}</td>
          ),

          // Horizontal rule
          hr: () => <hr className="my-4 border-slate-700/60" />,

          // Images (не рендерим, показываем ссылку)
          img: ({ src, alt }) => (
            <span className="text-una-400 underline text-sm">
              [изображение: {alt ?? src}]
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
