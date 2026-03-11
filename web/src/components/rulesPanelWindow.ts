export interface DesktopWindowState {
  width: number
  height: number
  x: number
  y: number
}

export interface StoredRulesPanelWindowState {
  windowState: DesktopWindowState
  isCollapsed: boolean
}

export interface ViewportBox {
  width: number
  height: number
  left: number
  top: number
}

interface PanelSize {
  width: number
  height: number
}

interface LegacyStoredWindowState {
  width: number
  height: number
  x: number
  y: number
}

const DEFAULT_OUTER_MARGIN_PX = 32
const MIN_WINDOW_WIDTH_PX = 460
const MIN_WINDOW_HEIGHT_PX = 420
const DEFAULT_WINDOW_WIDTH_PX = 896
const DEFAULT_WINDOW_HEIGHT_PX = 860
const STORAGE_VERSION = 2

export const DESKTOP_BREAKPOINT_PX = 640
export const WINDOW_MARGIN_PX = 16
export const COLLAPSED_PANEL_WIDTH_PX = 312
export const COLLAPSED_PANEL_HEIGHT_PX = 58

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function availableWindowSize(viewport: ViewportBox, margin: number): PanelSize {
  return {
    width: Math.max(1, viewport.width - margin * 2),
    height: Math.max(1, viewport.height - margin * 2),
  }
}

function clampDesktopWindowSize(
  state: DesktopWindowState,
  viewport: ViewportBox,
): DesktopWindowState {
  const available = availableWindowSize(viewport, WINDOW_MARGIN_PX)
  const minWidth = Math.min(MIN_WINDOW_WIDTH_PX, available.width)
  const minHeight = Math.min(MIN_WINDOW_HEIGHT_PX, available.height)
  return {
    ...state,
    width: clamp(state.width, minWidth, available.width),
    height: clamp(state.height, minHeight, available.height),
  }
}

function isLegacyStoredWindowState(value: unknown): value is LegacyStoredWindowState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<LegacyStoredWindowState>
  return (
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    typeof candidate.x === 'number' &&
    typeof candidate.y === 'number'
  )
}

function isStoredRulesPanelWindowState(value: unknown): value is StoredRulesPanelWindowState {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<StoredRulesPanelWindowState>
  return (
    typeof candidate.isCollapsed === 'boolean' &&
    isLegacyStoredWindowState(candidate.windowState)
  )
}

export function defaultDesktopWindowState(viewport: ViewportBox): DesktopWindowState {
  const available = availableWindowSize(viewport, DEFAULT_OUTER_MARGIN_PX)
  const width = clamp(
    DEFAULT_WINDOW_WIDTH_PX,
    Math.min(MIN_WINDOW_WIDTH_PX, available.width),
    available.width,
  )
  const height = clamp(
    DEFAULT_WINDOW_HEIGHT_PX,
    Math.min(MIN_WINDOW_HEIGHT_PX, available.height),
    available.height,
  )
  return {
    width,
    height,
    x: Math.round(viewport.left + (viewport.width - width) / 2),
    y: Math.round(viewport.top + (viewport.height - height) / 2),
  }
}

export function clampDesktopWindowState(
  state: DesktopWindowState,
  viewport: ViewportBox,
): DesktopWindowState {
  const sized = clampDesktopWindowSize(state, viewport)
  const x = clamp(
    sized.x,
    viewport.left + WINDOW_MARGIN_PX,
    Math.max(
      viewport.left + WINDOW_MARGIN_PX,
      viewport.left + viewport.width - sized.width - WINDOW_MARGIN_PX,
    ),
  )
  const y = clamp(
    sized.y,
    viewport.top + WINDOW_MARGIN_PX,
    Math.max(
      viewport.top + WINDOW_MARGIN_PX,
      viewport.top + viewport.height - sized.height - WINDOW_MARGIN_PX,
    ),
  )
  return { ...sized, x, y }
}

export function collapsedPanelSize(viewport: ViewportBox): PanelSize {
  const available = availableWindowSize(viewport, WINDOW_MARGIN_PX)
  return {
    width: Math.min(COLLAPSED_PANEL_WIDTH_PX, available.width),
    height: Math.min(COLLAPSED_PANEL_HEIGHT_PX, available.height),
  }
}

export function clampDesktopPanelOrigin(
  x: number,
  y: number,
  panel: PanelSize,
  viewport: ViewportBox,
): Pick<DesktopWindowState, 'x' | 'y'> {
  return {
    x: clamp(
      x,
      viewport.left + WINDOW_MARGIN_PX,
      Math.max(
        viewport.left + WINDOW_MARGIN_PX,
        viewport.left + viewport.width - panel.width - WINDOW_MARGIN_PX,
      ),
    ),
    y: clamp(
      y,
      viewport.top + WINDOW_MARGIN_PX,
      Math.max(
        viewport.top + WINDOW_MARGIN_PX,
        viewport.top + viewport.height - panel.height - WINDOW_MARGIN_PX,
      ),
    ),
  }
}

export function clampDesktopWindowForMode(
  state: DesktopWindowState,
  viewport: ViewportBox,
  isCollapsed: boolean,
): DesktopWindowState {
  const sized = clampDesktopWindowSize(state, viewport)
  if (!isCollapsed) {
    return clampDesktopWindowState(sized, viewport)
  }
  return {
    ...sized,
    ...clampDesktopPanelOrigin(
      sized.x,
      sized.y,
      collapsedPanelSize(viewport),
      viewport,
    ),
  }
}

export function getDesktopPanelRect(
  state: DesktopWindowState,
  viewport: ViewportBox,
  isCollapsed: boolean,
): DesktopWindowState {
  if (!isCollapsed) {
    return clampDesktopWindowState(state, viewport)
  }
  const sized = clampDesktopWindowSize(state, viewport)
  const panel = collapsedPanelSize(viewport)
  return {
    width: panel.width,
    height: panel.height,
    ...clampDesktopPanelOrigin(sized.x, sized.y, panel, viewport),
  }
}

export function parseStoredWindowState(raw: string | null): StoredRulesPanelWindowState | null {
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (isStoredRulesPanelWindowState(parsed)) {
      return {
        windowState: parsed.windowState,
        isCollapsed: parsed.isCollapsed,
      }
    }
    if (isLegacyStoredWindowState(parsed)) {
      return {
        windowState: parsed,
        isCollapsed: false,
      }
    }
  } catch {
    return null
  }
  return null
}

export function serializeStoredWindowState(value: StoredRulesPanelWindowState): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    windowState: value.windowState,
    isCollapsed: value.isCollapsed,
  })
}
