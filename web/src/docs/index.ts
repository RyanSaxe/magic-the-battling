import { parseDoc, type ParsedDoc } from './parse'
import type { Phase } from '../constants/phases'

import overviewRaw from './overview.md?raw'
import puppetsRaw from './puppets.md?raw'
import draftRaw from './phases/draft.md?raw'
import buildRaw from './phases/build.md?raw'
import battleRaw from './phases/battle.md?raw'
import rewardRaw from './phases/reward.md?raw'
import poisonRaw from './concepts/poison.md?raw'
import treasuresRaw from './concepts/treasures.md?raw'
import upgradesRaw from './concepts/upgrades.md?raw'
import suddenDeathRaw from './concepts/sudden-death.md?raw'
import ghostRaw from './concepts/ghost.md?raw'

export interface DocEntry {
  id: string
  category: 'getting-started' | 'phases' | 'concepts'
  raw: string
  parsed: ParsedDoc
}

function makeEntry(id: string, category: DocEntry['category'], raw: string): DocEntry {
  return { id, category, raw, parsed: parseDoc(raw) }
}

export const DOCS: DocEntry[] = [
  makeEntry('overview', 'getting-started', overviewRaw),
  makeEntry('puppets', 'getting-started', puppetsRaw),
  makeEntry('draft', 'phases', draftRaw),
  makeEntry('build', 'phases', buildRaw),
  makeEntry('battle', 'phases', battleRaw),
  makeEntry('reward', 'phases', rewardRaw),
  makeEntry('poison', 'concepts', poisonRaw),
  makeEntry('treasures', 'concepts', treasuresRaw),
  makeEntry('upgrades', 'concepts', upgradesRaw),
  makeEntry('sudden-death', 'concepts', suddenDeathRaw),
  makeEntry('ghost', 'concepts', ghostRaw),
]

const phaseDocMap = new Map<string, DocEntry>(
  DOCS.filter((d) => d.parsed.meta.phase).map((d) => [d.parsed.meta.phase!, d]),
)

export function getPhaseDoc(phase: Phase): DocEntry | undefined {
  return phaseDocMap.get(phase)
}
