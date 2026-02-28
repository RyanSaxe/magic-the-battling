const SKIP_WORDS = new Set(["the", "a", "an"])

function generateFallback(): string {
  return "Player" + String(Math.floor(1000 + Math.random() * 9000))
}

function extractName(fullName: string): string {
  const beforeComma = fullName.split(",")[0]
  const words = beforeComma
    .split(" ")
    .filter((w) => !SKIP_WORDS.has(w.toLowerCase()))
  return words[0] || generateFallback()
}

let namePromise: Promise<string> | null = null

export function prefetchLegendaryName(): void {
  if (namePromise) return
  namePromise = fetch("https://api.scryfall.com/cards/random?q=t:legend")
    .then((r) => r.json())
    .then((card) => extractName(card.name))
    .catch(() => generateFallback())
}

export function getLegendaryName(): Promise<string> {
  if (!namePromise) prefetchLegendaryName()
  return namePromise!
}
