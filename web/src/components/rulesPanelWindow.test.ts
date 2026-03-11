import { describe, expect, it } from 'vitest'
import {
  clampDesktopWindowForMode,
  getDesktopPanelRect,
  parseStoredWindowState,
  serializeStoredWindowState,
  type ViewportBox,
} from './rulesPanelWindow'

const viewport: ViewportBox = {
  width: 1000,
  height: 800,
  left: 0,
  top: 0,
}

describe('rules panel window helpers', () => {
  it('reads legacy stored desktop bounds as expanded state', () => {
    const parsed = parseStoredWindowState(
      JSON.stringify({ width: 640, height: 540, x: 120, y: 88 }),
    )

    expect(parsed).toEqual({
      windowState: { width: 640, height: 540, x: 120, y: 88 },
      isCollapsed: false,
    })
  })

  it('round-trips the versioned storage shape', () => {
    const serialized = serializeStoredWindowState({
      windowState: { width: 720, height: 600, x: 96, y: 72 },
      isCollapsed: true,
    })

    expect(parseStoredWindowState(serialized)).toEqual({
      windowState: { width: 720, height: 600, x: 96, y: 72 },
      isCollapsed: true,
    })
  })

  it('clamps collapsed state using collapsed geometry without discarding expanded size', () => {
    const clamped = clampDesktopWindowForMode(
      { width: 840, height: 700, x: 900, y: 760 },
      viewport,
      true,
    )

    expect(clamped).toEqual({
      width: 840,
      height: 700,
      x: 672,
      y: 726,
    })
  })

  it('derives the visible collapsed panel rect from the stored expanded state', () => {
    const rect = getDesktopPanelRect(
      { width: 840, height: 700, x: 900, y: 760 },
      viewport,
      true,
    )

    expect(rect).toEqual({
      width: 312,
      height: 58,
      x: 672,
      y: 726,
    })
  })
})
