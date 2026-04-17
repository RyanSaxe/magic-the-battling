export function battlerPlayUrl(b: {
  cube_id: string
  use_upgrades: boolean
  play_mode: string
  puppet_count: number
}): string {
  const params = new URLSearchParams()
  params.set('cubeId', b.cube_id)
  params.set('useUpgrades', String(b.use_upgrades))
  params.set('playMode', b.play_mode)
  params.set('puppetCount', String(b.puppet_count))
  return `/play?${params.toString()}`
}
