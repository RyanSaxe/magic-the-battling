export type Phase = "draft" | "build" | "battle" | "reward"
export const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

interface PhaseSummaryRow {
  text: string
  requiresUpgrades?: boolean
}

const PHASE_SUMMARY_ROWS: Record<Phase, PhaseSummaryRow[]> = {
  draft: [
    { text: 'Click any two cards to swap them.' },
    { text: 'Spend a treasure to see a new pack of 5 cards.' },
    { text: 'Next up: build your starting hand from your pool.' },
  ],
  build: [
    { text: 'Click any two cards to swap them.' },
    { text: 'Basic lands and treasures start on the battlefield.' },
    { text: 'Next: play magic with 10 life and an empty library.' },
  ],
  battle: [
    { text: 'Drag and drop cards between zones to play the game.' },
    { text: 'This is a sandbox, so nothing happens automatically.' },
    { text: 'Double tap on any card to tap/untap it.' },
  ],
  reward: [
    { text: 'After every battle, get a random card and a treasure.' },
    { text: 'After every 3rd battle, your hand size increases' },
    { text: 'After every 3rd battle, choose a special upgrade!', requiresUpgrades: true },
  ],
}

const PHASE_TIPS: Record<Phase, string> = {
  draft: "Some cards are bad for 3-card hands, but good for 5-card hands. Decide if they're worth holding onto.",
  build: "Treasures are persistent across phases. If you can create them early, that can snowball into a lategame advantage.",
  battle: "Treasures are persistent across phases. Using them to win means you have less later, so spend them carefully.",
  reward: "After battles, the cards other players cast can be seen in the sidebar. This can help you draft and build better hands.",
}

export function getPhaseTip(phase: Phase): string {
  return PHASE_TIPS[phase]
}

export function getPhaseSummaryRows(phase: Phase, useUpgrades: boolean): string[] {
  return PHASE_SUMMARY_ROWS[phase]
    .filter((row) => useUpgrades || !row.requiresUpgrades)
    .map((row) => row.text)
}
