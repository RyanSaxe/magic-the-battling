export type Phase = "draft" | "build" | "battle" | "reward"
export const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

interface PhaseSummaryRow {
  text: string
  requiresUpgrades?: boolean
}

const PHASE_SUMMARY_ROWS: Record<Phase, PhaseSummaryRow[]> = {
  draft: [
    { text: 'Click any two cards to swap them.' },
    { text: 'Spend treasures to see a new pack of 5 cards.' },
    { text: 'Next up: build your starting hand from your pool.' },
  ],
  build: [
    { text: 'Click any two cards to swap them.' },
    { text: 'Selected basic lands and treasures start untapped on the battlefield.' },
    { text: 'Your selected hand becomes your battle starting hand.' },
  ],
  battle: [
    { text: 'Drag and drop cards between zones to play out the game.' },
    { text: 'This is a sandbox phase, so nothing happens automatically.' },
    { text: 'Treasures roll over to the next phase, so spend them carefully.' },
  ],
  reward: [
    { text: 'After every battle, you get a random card and a treasure.' },
    { text: 'After every third battle, your hand size increases for next stage.' },
    { text: 'That third reward replaces the random card with a special reward.', requiresUpgrades: true },
  ],
}

export function getPhaseSummaryRows(phase: Phase, useUpgrades: boolean): string[] {
  return PHASE_SUMMARY_ROWS[phase]
    .filter((row) => useUpgrades || !row.requiresUpgrades)
    .map((row) => row.text)
}
