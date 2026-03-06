export interface DocMeta {
  title: string
  phase?: string
  order?: number
  [key: string]: string | number | undefined
}

export interface ParsedDoc {
  meta: DocMeta
  sections: Record<string, string>
  sectionTitles: Record<string, string>
  sectionOrder: string[]
  body: string
}

export function parseDoc(raw: string): ParsedDoc {
  const meta: DocMeta = { title: '' }
  let body = raw

  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (fmMatch) {
    for (const line of fmMatch[1].split(/\r?\n/)) {
      const kv = line.match(/^(\w+):\s*(.+)$/)
      if (kv) {
        const val = kv[2].trim()
        meta[kv[1]] = /^\d+$/.test(val) ? Number(val) : val
      }
    }
    body = fmMatch[2]
  }

  const sections: Record<string, string> = {}
  const sectionTitles: Record<string, string> = {}
  const sectionOrder: string[] = []

  const lines = body.split(/\r?\n/)
  let activeHeading: string | null = null
  let activeLines: string[] = []

  const flushSection = () => {
    if (!activeHeading) {
      return
    }
    sections[activeHeading] = activeLines.join('\n').trim()
    sectionOrder.push(activeHeading)
  }

  for (const line of lines) {
    const headingMatch = line.match(/^##(?!#)\s*(.+?)\s*$/)
    if (headingMatch) {
      flushSection()
      const title = headingMatch[1].trim()
      activeHeading = title.toLowerCase()
      sectionTitles[activeHeading] = title
      activeLines = []
      continue
    }
    if (activeHeading) {
      activeLines.push(line)
    }
  }
  flushSection()

  return { meta, sections, sectionTitles, sectionOrder, body }
}

export function extractBullets(section: string): string[] {
  return section
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
}
