import type { ReactNode } from 'react'

/** What a cube card or page says it is: a saved Cube or Deck, a followed cube, or a community cube (Cube). */
export type CubeBadgeTone = 'Cube' | 'Deck' | 'Following'

const TONE_CLASSES: Record<CubeBadgeTone, string> = {
  Cube: 'bg-amber-500/80 text-black',
  Deck: 'bg-blue-600/80 text-white',
  Following: 'bg-emerald-600/80 text-white',
}

export function CubeBadge({ tone, children, className }: { tone: CubeBadgeTone; children: ReactNode; className: string }) {
  return (
    <span
      className={`${className} rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  )
}
