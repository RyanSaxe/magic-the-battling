export interface DocMeta {
  title: string
  phase?: string
  order?: number
  [key: string]: string | number | undefined
}

export interface ParsedDoc {
  meta: DocMeta
  sections: Record<string, string>
  body: string
}

export function parseDoc(raw: string): ParsedDoc {
  const meta: DocMeta = { title: '' }
  let body = raw

  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/)
      if (kv) {
        const val = kv[2].trim()
        meta[kv[1]] = /^\d+$/.test(val) ? Number(val) : val
      }
    }
    body = fmMatch[2]
  }

  const sections: Record<string, string> = {}
  const parts = body.split(/^## /m)
  for (const part of parts.slice(1)) {
    const nlIdx = part.indexOf('\n')
    const heading = part.slice(0, nlIdx).trim().toLowerCase()
    sections[heading] = part.slice(nlIdx + 1).trim()
  }

  return { meta, sections, body }
}

export function extractBullets(section: string): string[] {
  return section
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
}
