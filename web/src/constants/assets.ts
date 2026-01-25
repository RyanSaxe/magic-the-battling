export const SCRYFALL_SYMBOLS = {
  W: 'https://svgs.scryfall.io/card-symbols/W.svg',
  U: 'https://svgs.scryfall.io/card-symbols/U.svg',
  B: 'https://svgs.scryfall.io/card-symbols/B.svg',
  R: 'https://svgs.scryfall.io/card-symbols/R.svg',
  G: 'https://svgs.scryfall.io/card-symbols/G.svg',
  C: 'https://svgs.scryfall.io/card-symbols/C.svg',
  T: 'https://svgs.scryfall.io/card-symbols/T.svg',
}

export const BASIC_LAND_SYMBOLS: Record<string, string> = {
  Plains: SCRYFALL_SYMBOLS.W,
  Island: SCRYFALL_SYMBOLS.U,
  Swamp: SCRYFALL_SYMBOLS.B,
  Mountain: SCRYFALL_SYMBOLS.R,
  Forest: SCRYFALL_SYMBOLS.G,
  Wastes: SCRYFALL_SYMBOLS.C,
}

export const BASIC_LANDS = [
  { name: 'Plains', symbol: 'W' },
  { name: 'Island', symbol: 'U' },
  { name: 'Swamp', symbol: 'B' },
  { name: 'Mountain', symbol: 'R' },
  { name: 'Forest', symbol: 'G' },
  { name: 'Wastes', symbol: 'C' },
] as const

export const BASIC_LAND_IMAGES: Record<string, string> = {
  Plains: 'https://cards.scryfall.io/large/front/1/d/1d7dba1c-a702-43c0-8fca-e47bbad4a00f.jpg',
  Island: 'https://cards.scryfall.io/large/front/0/c/0c4eaecf-dd4c-45ab-9b50-2abe987d35d4.jpg',
  Swamp: 'https://cards.scryfall.io/large/front/8/3/8365ab45-6d78-47ad-a6ed-282069b0fabc.jpg',
  Mountain: 'https://cards.scryfall.io/large/front/4/2/42232ea6-e31d-46a6-9f94-b2ad2416d79b.jpg',
  Forest: 'https://cards.scryfall.io/large/front/1/9/19e71532-3f79-4fec-974f-b0e85c7fe701.jpg',
  Wastes: 'https://cards.scryfall.io/large/front/6/4/643d0ee1-016c-4ea8-b469-3599ae7532e6.jpg',
}

export const TREASURE_TOKEN_IMAGE = 'https://cards.scryfall.io/large/front/f/a/fa8bbe0c-3813-4e3f-9bcf-cffe4fed6341.jpg'

export const POISON_COUNTER_IMAGE = 'https://cards.scryfall.io/large/front/4/7/470618f6-f67f-44c6-a086-285632508915.jpg?1561757039'

export const THE_VANQUISHER_IMAGE = 'https://cards.scryfall.io/large/front/0/8/08a63083-997b-4a72-af48-cd35e6e9599d.jpg?1561756617'

export const CARD_BACK_IMAGE = 'https://backs.scryfall.io/large/2/2/222b7a3b-2321-4d4c-af19-19338b134971.jpg?1677416389'
