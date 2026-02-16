import type { Card } from '../types'

const SHOWCASE_IMAGES = {
  emperorOfBones: 'https://cards.scryfall.io/large/front/d/f/df9d9075-2d1e-4848-b661-816d539e05eb.jpg?1763472848',
  snuffOut: 'https://cards.scryfall.io/large/front/7/5/75bbe89f-09af-494e-b58e-271f64bde4b5.jpg?1764758700',
  jewelThief: 'https://cards.scryfall.io/large/front/7/3/736e498e-1245-40c1-96a4-c9bcfd1cfe1f.jpg?1664412359',
  myrBattlesphere: 'https://cards.scryfall.io/large/front/7/1/71e7ef4a-2032-4571-afc6-5207d4b40c3d.jpg?1743207335',
  lakeOfTheDead: 'https://cards.scryfall.io/large/front/1/b/1b0502c5-43d0-4c36-b585-e5507134bf9e.jpg?1562900332',
  leylineOfLifeforce: 'https://cards.scryfall.io/large/front/f/7/f7caffa7-29bd-455c-9770-94a0ad7ef5e3.jpg?1593272476',
  galadrielsDismissal: 'https://cards.scryfall.io/large/front/2/d/2d1c66a7-a39e-4869-80c7-1cec89777e0d.jpg?1695380176',
  immediateAction: 'https://cards.scryfall.io/large/front/1/6/167c6740-0625-4987-8fac-516aab564ca1.jpg?1720517036',
}

function makeCard(id: string, name: string, imageUrl: string, upgradeTarget?: Card): Card {
  return {
    id,
    name,
    image_url: imageUrl,
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: '',
    tokens: [],
    elo: null,
    upgrade_target: upgradeTarget ?? null,
    oracle_text: null,
  }
}

const CARDS = {
  emperorOfBones: makeCard('showcase-emperor', 'Emperor of Bones', SHOWCASE_IMAGES.emperorOfBones),
  snuffOut: makeCard('showcase-snuff-out', 'Snuff Out', SHOWCASE_IMAGES.snuffOut),
  jewelThief: makeCard('showcase-jewel-thief', 'Jewel Thief', SHOWCASE_IMAGES.jewelThief),
  myrBattlesphere: makeCard('showcase-myr-battlesphere', 'Myr Battlesphere', SHOWCASE_IMAGES.myrBattlesphere),
  lakeOfTheDead: makeCard('showcase-lake', 'Lake of the Dead', SHOWCASE_IMAGES.lakeOfTheDead),
  leylineOfLifeforce: makeCard('showcase-leyline', 'Leyline of Lifeforce', SHOWCASE_IMAGES.leylineOfLifeforce),
  galadrielsDismissal: makeCard('showcase-galadriels', "Galadriel's Dismissal", SHOWCASE_IMAGES.galadrielsDismissal),
  immediateAction: makeCard('showcase-immediate-action', 'Immediate Action', SHOWCASE_IMAGES.immediateAction),
}

const myrWithUpgrade = makeCard(
  'showcase-myr-upgraded',
  'Myr Battlesphere',
  SHOWCASE_IMAGES.myrBattlesphere,
  CARDS.immediateAction,
)

export interface UpgradeAnimation {
  targetCardId: string
  upgradeCard: Card
  stackedCard: Card
}

export interface CarouselStage {
  tagline: string
  hand: Card[]
  battlefield: { lands: string[]; treasures: number }
  upgrade?: UpgradeAnimation
}

export const SHOWCASE_STAGES: CarouselStage[] = [
  {
    tagline: 'Start with scraps.',
    hand: [CARDS.emperorOfBones, CARDS.snuffOut, CARDS.jewelThief],
    battlefield: { lands: ['Swamp', 'Swamp', 'Forest'], treasures: 0 },
  },
  {
    tagline: 'Find your lane.',
    hand: [CARDS.emperorOfBones, CARDS.snuffOut, CARDS.myrBattlesphere, CARDS.lakeOfTheDead],
    battlefield: { lands: ['Swamp', 'Swamp', 'Swamp'], treasures: 1 },
  },
  {
    tagline: 'Become unbeatable.',
    hand: [CARDS.lakeOfTheDead, CARDS.myrBattlesphere, CARDS.snuffOut, CARDS.leylineOfLifeforce, CARDS.galadrielsDismissal],
    battlefield: { lands: ['Swamp', 'Swamp', 'Swamp'], treasures: 2 },
    upgrade: {
      targetCardId: 'showcase-myr-battlesphere',
      upgradeCard: CARDS.immediateAction,
      stackedCard: myrWithUpgrade,
    },
  },
]
