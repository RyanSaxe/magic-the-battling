export type Phase = 'draft' | 'build' | 'battle' | 'reward'

export const PHASE_HINTS: Record<Phase, string> = {
  draft: 'Click pack card + pool card to swap',
  build: 'Click hand + pool to swap • Select 3 basics',
  battle: 'Drag cards • Right-click for actions',
  reward: 'Select your upgrade',
}

export const PHASE_RULES: Record<Phase, { title: string; rules: string[] }> = {
  draft: {
    title: 'Draft Phase',
    rules: [
      'BUY: Click a card in the pack and a card in your pool to swap them',
      'ROLL: Spend 1 treasure to reroll the pack (keeps current pack size)',
      'Each round you draft from a pack equal to your stage number',
      'Treasures persist between rounds and can be spent during battle',
    ],
  },
  build: {
    title: 'Build Phase',
    rules: [
      'Click a card in your hand and pool to swap them',
      'Select exactly 3 basic lands to add to your deck',
      'Your hand size is limited based on your stage',
      'Ready up when satisfied with your deck configuration',
    ],
  },
  battle: {
    title: 'Battle Phase',
    rules: [
      'Each player starts with 10 life',
      'There is no library - you cannot draw cards or mill',
      'Drag cards between zones (hand, battlefield, graveyard, exile)',
      'Right-click cards for actions (tap, add counters, etc.)',
      'Losing a battle adds 1 poison counter (10 poison = elimination)',
      'Treasures persist and can be spent to create treasure tokens',
    ],
  },
  reward: {
    title: 'Reward Phase',
    rules: [
      'Win: +1 treasure',
      'Lose: +2 treasures',
      'Draw: +1 treasure each',
      'Completing a stage: Choose an upgrade to enhance your abilities',
      'Upgrades provide permanent bonuses for the rest of the game',
    ],
  },
}
