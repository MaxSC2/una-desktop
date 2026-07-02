/**
 * CodeBlock — компонент для отображения code blocks с syntax highlighting.
 *
 * Props:
 *  - code: строка кода
 *  - language: язык (python, javascript, typescript, bash, json, и т.д.)
 *  - showLineNumbers: показывать номера строк (по умолчанию false)
 */

'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}

export function CodeBlock({ code, language = 'text', showLineNumbers = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Fallback для older browsers
      const textarea = document.createElement('textarea');
      textarea.value = code;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
      document.body.removeChild(textarea);
    }
  };

  // Нормализуем язык
  const normalizedLang = normalizeLanguage(language);

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-slate-700/60 bg-[#1e1e1e]">
      {/* Header с языком и кнопкой copy */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/60">
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {normalizedLang}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-una-300 transition-colors"
          title="Скопировать код"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Скопировано</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Копировать</span>
            </>
          )}
        </button>
      </div>

      {/* Code с syntax highlighting */}
      <div className="overflow-x-auto text-sm">
        <SyntaxHighlighter
          language={normalizedLang}
          style={vscDarkPlus}
          showLineNumbers={showLineNumbers}
          customStyle={{
            margin: 0,
            background: 'transparent',
            padding: '12px',
            fontSize: '13px',
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          }}
          codeTagProps={{
            style: {
              fontFamily: 'inherit',
            },
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

/**
 * Нормализует название языка для SyntaxHighlighter.
 */
function normalizeLanguage(lang: string): string {
  const lower = lang.toLowerCase().trim();

  const aliases: Record<string, string> = {
    js: 'javascript',
    jsx: 'jsx',
    ts: 'typescript',
    tsx: 'tsx',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    md: 'markdown',
    golang: 'go',
    cs: 'csharp',
    cpp: 'cpp',
    'c++': 'cpp',
    'c#': 'csharp',
    ps1: 'powershell',
    ps: 'powershell',
    cmd: 'batch',
    bat: 'batch',
    '': 'text',
    text: 'text',
    plain: 'text',
  };

  return aliases[lower] ?? lower;
}
