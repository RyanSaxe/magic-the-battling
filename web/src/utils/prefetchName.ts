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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  namePromise = fetch("https://api.scryfall.com/cards/random?q=t:legend", {
    signal: controller.signal,
  })
    .then((r) => r.json())
    .then((card) => extractName(card.name))
    .catch(() => generateFallback())
    .finally(() => clearTimeout(timeout))
}

export function getLegendaryName(): Promise<string> {
  if (!namePromise) prefetchLegendaryName()
  return namePromise!
}
