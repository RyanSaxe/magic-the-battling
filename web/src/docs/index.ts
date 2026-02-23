import { parseDoc, type ParsedDoc } from './parse'
import type { Phase } from '../constants/phases'

const mdModules = import.meta.glob<string>('./**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})

export interface DocEntry {
  id: string
  category: string
  raw: string
  parsed: ParsedDoc
}

function makeEntry(id: string, category: DocEntry['category'], raw: string): DocEntry {
  return { id, category, raw, parsed: parseDoc(raw) }
}

export const DOCS: DocEntry[] = Object.entries(mdModules).map(([path, raw]) => {
  const parts = path.replace(/^\.\//, '').replace(/\.md$/, '').split('/')
  const id = parts[parts.length - 1]
  const category = parts.length > 1 ? parts[0] : 'getting-started'
  return makeEntry(id, category, raw)
})

const phaseDocMap = new Map<string, DocEntry>(
  DOCS.filter((d) => d.parsed.meta.phase).map((d) => [d.parsed.meta.phase!, d]),
)

export function getPhaseDoc(phase: Phase): DocEntry | undefined {
  return phaseDocMap.get(phase)
}
