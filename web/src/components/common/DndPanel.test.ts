import { describe, expect, it } from 'vitest'
import { resolveBattlePanelLayout } from './DndPanelLayout'

function gridSize(width: number, height: number, columns: number, rows: number) {
  const gap = 6
  return {
    width: columns * width + gap * Math.max(0, columns - 1),
    height: rows * height + gap * Math.max(0, rows - 1),
  }
}

describe('resolveBattlePanelLayout', () => {
  it('packs desktop battle panels into multiple columns when space allows', () => {
    const layout = resolveBattlePanelLayout(5, 239, 720)

    expect(layout.columns).toBeGreaterThan(1)
    expect(layout.rows).toBeGreaterThan(1)
  })

  it('always fits the computed grid inside the available panel box', () => {
    const layout = resolveBattlePanelLayout(8, 239, 420)
    const size = gridSize(layout.width, layout.height, layout.columns, layout.rows)

    expect(size.width).toBeLessThanOrEqual(239)
    expect(size.height).toBeLessThanOrEqual(420)
  })

  it('keeps constrained mobile panels inside bounds', () => {
    const layout = resolveBattlePanelLayout(6, 320, 220)
    const size = gridSize(layout.width, layout.height, layout.columns, layout.rows)

    expect(size.width).toBeLessThanOrEqual(320)
    expect(size.height).toBeLessThanOrEqual(220)
    expect(layout.columns).toBeGreaterThan(1)
  })
})
