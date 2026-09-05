'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Check, Copy } from 'lucide-react'

/**
 * Shared, sanitized Markdown renderer used by both the AI chat and the
 * weekly analysis tab. Replaces two separate hand-rolled regex renderers
 * that injected raw HTML via dangerouslySetInnerHTML.
 */

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ['className']],
  },
}

function CodeBlock({ className, children }: { className?: string; children: string }) {
  const [copied, setCopied] = useState(false)
  const language = /language-(\w+)/.exec(className || '')?.[1] || 'testo'
  const code = children.replace(/\n$/, '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard API unavailable — silently ignore, copy is a convenience.
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden my-2 bg-surface">
      <div className="flex items-center justify-between px-3.5 py-2 text-[11px] font-mono text-muted">
        <span>{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-elevated t cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-income" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copiato' : 'Copia'}
        </button>
      </div>
      <pre className="m-0 px-4 py-3 overflow-x-auto text-[12.5px] font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export function Markdown({ children }: { children: string }) {
  if (!children) return null

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          h1: ({ children }) => <h1 className="text-xl font-semibold mt-5 mb-2.5 first:mt-0 tracking-tight">{children}</h1>,
          h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 first:mt-0 tracking-tight">{children}</h2>,
          h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-1.5 first:mt-0 tracking-tight">{children}</h3>,
          h4: ({ children }) => <h4 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h4>,
          h5: ({ children }) => <h5 className="text-xs font-semibold mt-2.5 mb-1 first:mt-0 uppercase tracking-wide text-muted">{children}</h5>,
          h6: ({ children }) => <h6 className="text-xs font-semibold mt-2 mb-1 first:mt-0 uppercase tracking-wide text-muted">{children}</h6>,
          p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="mb-2.5 last:mb-0 pl-5 space-y-1 list-disc">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2.5 last:mb-0 pl-5 space-y-1 list-decimal">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-income underline decoration-income/40 hover:decoration-income">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-income/40 pl-3.5 my-2.5 text-muted italic">{children}</blockquote>
          ),
          hr: () => <hr className="my-4 border-border" />,
          table: ({ children }) => (
            <div className="my-2.5 rounded-2xl overflow-hidden bg-surface overflow-x-auto">
              <table className="w-full text-[13px] border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children, style }) => (
            <th
              style={style}
              className="text-left px-3.5 py-2.5 bg-elevated text-muted font-semibold text-[11px] uppercase tracking-wider"
            >
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td style={style} className="px-3.5 py-2.5 border-t border-border tabular-nums">
              {children}
            </td>
          ),
          code(props) {
            const { className, children } = props as { className?: string; children?: React.ReactNode; inline?: boolean }
            const isBlock = /language-/.test(className || '') || String(children).includes('\n')
            if (!isBlock) {
              return <code className="px-1.5 py-0.5 rounded-md bg-elevated font-mono text-[0.9em]">{children}</code>
            }
            return <CodeBlock className={className}>{String(children)}</CodeBlock>
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
