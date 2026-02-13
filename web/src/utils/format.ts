export function getOrdinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0])
}

export function collapseDuplicateBasics(lands: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const land of lands) {
    counts.set(land, (counts.get(land) ?? 0) + 1)
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
}
