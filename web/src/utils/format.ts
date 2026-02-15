export function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

export function getPlacementBadgeColor(position: number, total: number): { bg: string; text: string } {
  if (position === 1) return { bg: '#facc15', text: '#000000' }
  if (position === 2) return { bg: '#9ca3af', text: '#000000' }
  if (position === 3) return { bg: '#cd7f32', text: '#ffffff' }
  if (position === total) return { bg: '#ef4444', text: '#ffffff' }
  return { bg: '#6b7280', text: '#ffffff' }
}
