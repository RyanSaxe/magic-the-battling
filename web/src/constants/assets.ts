export const SCRYFALL_SYMBOLS = {
  W: 'https://svgs.scryfall.io/card-symbols/W.svg',
  U: 'https://svgs.scryfall.io/card-symbols/U.svg',
  B: 'https://svgs.scryfall.io/card-symbols/B.svg',
  R: 'https://svgs.scryfall.io/card-symbols/R.svg',
  G: 'https://svgs.scryfall.io/card-symbols/G.svg',
  T: 'https://svgs.scryfall.io/card-symbols/T.svg',
}

export const BASIC_LAND_SYMBOLS: Record<string, string> = {
  Plains: SCRYFALL_SYMBOLS.W,
  Island: SCRYFALL_SYMBOLS.U,
  Swamp: SCRYFALL_SYMBOLS.B,
  Mountain: SCRYFALL_SYMBOLS.R,
  Forest: SCRYFALL_SYMBOLS.G,
}

export const BASIC_LANDS = [
  { name: 'Plains', symbol: 'W' },
  { name: 'Island', symbol: 'U' },
  { name: 'Swamp', symbol: 'B' },
  { name: 'Mountain', symbol: 'R' },
  { name: 'Forest', symbol: 'G' },
] as const
