/** What a cube card or page says it is: a saved Cube or Deck, a followed cube, or a community cube (Cube). */
export type CubeBadge = 'Cube' | 'Deck' | 'Following'

export const BADGE_CLASSES: Record<CubeBadge, string> = {
  Cube: 'bg-amber-500/80 text-black',
  Deck: 'bg-blue-600/80 text-white',
  Following: 'bg-emerald-600/80 text-white',
}
