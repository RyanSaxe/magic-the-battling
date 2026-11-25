import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkCalloutDirectives from "@microflash/remark-callout-directives";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { useDocNav } from "../contexts/DocNavContext";
import { PHASE_HOTKEYS } from "../constants/hotkeys";
import { HotkeyRow } from "./HotkeyRow";
import { selectInputBlocks } from "../docs/parse";
import { canHover } from "../utils/inputMode";
import { LINK } from "./common/styles";

function urlTransform(url: string): string {
  if (url.startsWith("doc:") || url.startsWith("docs:")) return url;
  return defaultUrlTransform(url);
}

const calloutOptions = {
  callouts: {
    tip: {
      title: "Tip",
      hint: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" aria-hidden="true"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
    },
  },
};

const HOTKEY_RE = /\{\{hotkeys:(\w[\w-]*)\}\}/;

function DocLink({ href, children }: ComponentPropsWithoutRef<"a">): ReactNode {
  const docNav = useDocNav();
  if (href?.startsWith("doc:") || href?.startsWith("docs:")) {
    const rest = href.startsWith("docs:") ? href.slice(5) : href.slice(4);
    const [docId, tab] = rest.split("#");
    return (
      <button
        onClick={() => docNav.navigate(docId, tab)}
        className={`${LINK} underline decoration-dotted decoration-amber-400/15 underline-offset-2 hover:decoration-solid hover:decoration-amber-400/40 transition-colors cursor-pointer`}
      >
        {children}
      </button>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${LINK} underline decoration-dotted decoration-amber-400/15 underline-offset-2 hover:decoration-solid hover:decoration-amber-400/40 transition-colors`}
    >
      {children}
    </a>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  h2: ({ children }): ReactNode => (
    <h2 className="text-sm font-semibold text-[var(--ivory)] tracking-wide mt-5 mb-2 first:mt-0 border-b border-amber-400/15 pb-1">
      {children}
    </h2>
  ),
  h3: ({ children }): ReactNode => (
    <h3 className="text-sm font-semibold text-amber-400/80 uppercase tracking-wider mt-4 mb-1.5">
      {children}
    </h3>
  ),
  p: ({ children }): ReactNode => (
    <p className="text-sm text-[var(--ivory-muted)] mb-3 leading-relaxed">
      {children}
    </p>
  ),
  ul: ({ children }): ReactNode => (
    <ul className="doc-list space-y-1.5 mb-3">{children}</ul>
  ),
  li: ({ children }): ReactNode => (
    <li className="doc-list-item flex gap-2 text-sm text-[var(--ivory-muted)] leading-relaxed">
      <span>{children}</span>
    </li>
  ),
  table: ({ children }): ReactNode => (
    <table className="w-full text-sm text-[var(--ivory-muted)] mb-3 [&_tr:nth-child(even)]:bg-white/3">
      {children}
    </table>
  ),
  th: ({ children }): ReactNode => (
    <th className="text-left text-[var(--ivory-muted)] font-medium pb-1 pr-3 border-b border-amber-400/15">
      {children}
    </th>
  ),
  td: ({ children }): ReactNode => <td className="pb-1 pr-3">{children}</td>,
  strong: ({ children }): ReactNode => (
    <strong className="text-amber-200 font-semibold">{children}</strong>
  ),
  hr: (): ReactNode => <hr className="border-t border-amber-400/20 my-4" />,
  blockquote: ({ children }): ReactNode => (
    <blockquote className="border-l-3 border-amber-400/40 pl-4 italic text-[var(--ivory-muted)] my-3">
      {children}
    </blockquote>
  ),
  a: DocLink,
};

interface DocSegment {
  key: string;
  kind: "hotkeys" | "markdown";
  value: string;
}

function splitDocSegments(content: string): DocSegment[] {
  const parts = selectInputBlocks(content, canHover).split(HOTKEY_RE);
  const seen = new Map<string, number>();
  const segments: DocSegment[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const value = parts[i];
    const kind = i % 2 === 1 ? "hotkeys" : "markdown";
    if (kind === "markdown" && !value) continue;
    const base = `${kind}:${value}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    segments.push({ key: `${base}#${count}`, kind, value });
  }
  return segments;
}

interface DocRendererProps {
  content: string;
  className?: string;
}

export function DocRenderer({
  content,
  className,
}: DocRendererProps): ReactNode {
  const segments = splitDocSegments(content);

  return (
    <div className={className}>
      {segments.map((segment) => {
        if (segment.kind === "hotkeys") {
          const hotkeys = PHASE_HOTKEYS[segment.value] ?? [];
          const hoverHotkeys = PHASE_HOTKEYS[`${segment.value}-hover`] ?? [];
          return (
            <div key={segment.key} className="space-y-4">
              {hotkeys.length > 0 && (
                <div className="space-y-1.5">
                  {hotkeys.map((entry) => (
                    <HotkeyRow key={entry.key} entry={entry} />
                  ))}
                </div>
              )}
              {hoverHotkeys.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--ivory-muted)] uppercase tracking-wide mb-2">
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
          );
        }
        return (
          <Markdown
            key={segment.key}
            remarkPlugins={[
              remarkGfm,
              remarkDirective,
              [remarkCalloutDirectives, calloutOptions],
            ]}
            rehypePlugins={[rehypeRaw]}
            urlTransform={urlTransform}
            components={MARKDOWN_COMPONENTS}
          >
            {segment.value}
          </Markdown>
        );
      })}
    </div>
  );
}
