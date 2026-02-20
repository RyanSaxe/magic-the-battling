import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

const components: Components = {
  h2: ({ children }) => (
    <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mt-4 mb-1 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-medium text-gray-300 mt-3 mb-1">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm text-gray-300 mb-2">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="space-y-0.5 mb-2">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="flex gap-2 text-sm text-gray-300">
      <span className="text-amber-400 shrink-0">•</span>
      <span>{children}</span>
    </li>
  ),
  table: ({ children }) => (
    <table className="w-full text-sm text-gray-300 mb-2">{children}</table>
  ),
  th: ({ children }) => (
    <th className="text-left text-gray-400 font-medium pb-1 pr-3">{children}</th>
  ),
  td: ({ children }) => (
    <td className="pb-1 pr-3">{children}</td>
  ),
  strong: ({ children }) => (
    <strong className="text-white font-medium">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">
      {children}
    </a>
  ),
}

interface DocRendererProps {
  content: string
  className?: string
}

export function DocRenderer({ content, className }: DocRendererProps) {
  return (
    <div className={className}>
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  )
}
