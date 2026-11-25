const SKIP_WORDS = new Set(["the", "a", "an"]);

function generateFallback(): string {
  return "Player" + String(Math.floor(1000 + Math.random() * 9000));
}

function extractName(fullName: string): string {
  const beforeComma = fullName.split(",")[0];
  const word = beforeComma
    .split(" ")
    .find((w) => !SKIP_WORDS.has(w.toLowerCase()));
  return word || generateFallback();
}

let namePromise: Promise<string> | null = null;

function startLegendaryNameFetch(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  return fetch("https://api.scryfall.com/cards/random?q=t:legend", {
    signal: controller.signal,
  })
    .then((r) => r.json())
    .then((card) => extractName(card.name))
    .catch(() => generateFallback())
    .finally(() => clearTimeout(timeout));
}

export function prefetchLegendaryName(): void {
  namePromise ??= startLegendaryNameFetch();
}

export function getLegendaryName(): Promise<string> {
  namePromise ??= startLegendaryNameFetch();
  return namePromise;
}
