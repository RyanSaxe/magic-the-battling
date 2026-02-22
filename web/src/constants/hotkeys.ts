export interface HotkeyEntry {
  key: string
  description: string
  subActions?: { key: string; description: string }[]
}

export const PHASE_HOTKEYS: Record<string, HotkeyEntry[]> = {
  global: [
    { key: '?', description: 'Open/close guide' },
    { key: 'Enter', description: 'Advance phase or confirm (some phases require a follow-up key)' },
    { key: 'Escape', description: 'Close panels and modals' },
    { key: 'Z', description: 'Zoom (preview card)' },
  ],
  lobby: [
    { key: 'Enter', description: 'Toggle ready / Start game (host)' },
    { key: 'R', description: 'Toggle ready' },
  ],
  draft: [
    { key: 'R', description: 'Reroll pack (costs 1 treasure)' },
    { key: 'U', description: 'View upgrades' },
    { key: 'Enter', description: 'Done drafting → go to Build' },
  ],
  build: [
    {
      key: 'Enter',
      description: 'Submit hand / Unready',
      subActions: [
        { key: 'P', description: 'Play (first turn)' },
        { key: 'D', description: 'Draw (second turn)' },
      ],
    },
    { key: 'U', description: 'Upgrades' },
  ],
  battle: [
    { key: 'U', description: 'Untap all permanents' },
    { key: 'P', description: 'Pass turn' },
    { key: 'T', description: 'Create treasure' },
    {
      key: 'Enter',
      description: 'Submit result',
      subActions: [
        { key: 'W', description: 'I Won' },
        { key: 'D', description: 'Draw' },
        { key: 'L', description: 'I Lost' },
      ],
    },
    { key: 'V', description: 'View upgrades' },
  ],
  reward: [
    { key: 'Enter', description: 'Continue / Claim & Continue' },
  ],
  'build-hover': [
    { key: 'U', description: 'Apply upgrade to this card' },
  ],
  'battle-hover': [
    { key: 'T', description: 'Tap / Untap' },
    { key: 'F', description: 'Flip' },
    { key: 'G', description: 'Move to graveyard' },
    { key: 'H', description: 'Move to hand' },
    { key: 'B', description: 'Move to battlefield' },
    { key: 'E', description: 'Move to exile' },
  ],
}
