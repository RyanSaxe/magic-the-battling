import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkDirective from 'remark-directive'
import remarkCalloutDirectives from '@microflash/remark-callout-directives'
import rehypeRaw from 'rehype-raw'
import type { Components } from 'react-markdown'
import { useDocNav } from '../contexts/DocNavContext'
import { PHASE_HOTKEYS } from '../constants/hotkeys'
import { HotkeyRow } from './HotkeyRow'

function urlTransform(url: string) {
  if (url.startsWith('doc:')) return url
  return defaultUrlTransform(url)
}

const calloutOptions = {
  callouts: {
    tip: {
      title: 'Tip',
      hint: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    },
  },
}

const HOTKEY_RE = /\{\{hotkeys:(\w[\w-]*)\}\}/

interface DocRendererProps {
  content: string
  className?: string
}

export function DocRenderer({ content, className }: DocRendererProps) {
  const docNav = useDocNav()

  const components: Components = {
    h2: ({ children }) => (
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mt-4 mb-1 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mt-3 mb-1">
        {children}
      </h3>
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
    a: ({ href, children }) => {
      if (href?.startsWith('doc:')) {
        const rest = href.slice(4)
        const [docId, tab] = rest.split('#')
        return (
          <button
            onClick={() => docNav.navigate(docId, tab)}
            className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
          >
            {children}
          </button>
        )
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 transition-colors">
          {children}
        </a>
      )
    },
  }

  const segments = content.split(HOTKEY_RE)

  return (
    <div className={className}>
      {segments.map((segment, i) => {
        if (i % 2 === 1) {
          const key = segment
          const hotkeys = PHASE_HOTKEYS[key] ?? []
          const hoverHotkeys = PHASE_HOTKEYS[`${key}-hover`] ?? []
          return (
            <div key={i} className="space-y-4">
              {hotkeys.length > 0 && (
                <div className="space-y-1.5">
                  {hotkeys.map((entry) => (
                    <HotkeyRow key={entry.key} entry={entry} />
                  ))}
                </div>
              )}
              {hoverHotkeys.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    When Hovering a Card
                  </h3>
                  <div className="space-y-1.5">
                    {hoverHotkeys.map((entry) => (
                      <HotkeyRow key={entry.key} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }
        if (!segment) return null
        return (
          <Markdown key={i} remarkPlugins={[remarkGfm, remarkDirective, [remarkCalloutDirectives, calloutOptions]]} rehypePlugins={[rehypeRaw]} urlTransform={urlTransform} components={components}>
            {segment}
          </Markdown>
        )
      })}
    </div>
  )
}
