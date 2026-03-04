export type Phase = "draft" | "build" | "battle" | "reward"
export const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

export const PHASE_SUMMARIES: Record<Phase, string> = {
  draft: 'Pick cards from a pack of 5 to improve your pool. Spend treasures to reroll for better options.',
  build: 'Choose your starting hand and lands from your pool. Apply upgrades if you have them.',
  battle: 'Play a mini-game of Magic (10 life, no library). Loser gets poison counters.',
  reward: 'Collect treasures and bonus cards. Every 3rd round increases your hand size.',
}
