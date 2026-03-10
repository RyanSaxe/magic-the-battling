import { useCallback, useEffect, useState } from 'react'
import { QuickGuide } from './QuickGuide'

export interface RulesPanelTarget {
  docId?: string
  tab?: string
}

interface RulesPanelProps {
  onClose: () => void
  initialDocId?: string
  initialTab?: string
  gameId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
}

interface DesktopWindowState {
  width: number
  height: number
  x: number
  y: number
}

interface ViewportBox {
  width: number
  height: number
  left: number
  top: number
}

type InteractionState =
  | {
      type: 'drag'
      startPointerX: number
      startPointerY: number
      startX: number
      startY: number
    }
  | {
      type: 'resize'
      startPointerX: number
      startPointerY: number
      startWidth: number
      startHeight: number
    }
  | null

const DESKTOP_BREAKPOINT_PX = 640
const WINDOW_STORAGE_KEY = 'mtb_rules_panel_window:v1'
const WINDOW_MARGIN_PX = 16
const DEFAULT_OUTER_MARGIN_PX = 32
const MIN_WINDOW_WIDTH_PX = 460
const MIN_WINDOW_HEIGHT_PX = 420
const DEFAULT_WINDOW_WIDTH_PX = 896
const DEFAULT_WINDOW_HEIGHT_PX = 860
const RESET_LABEL = 'Reset'

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function currentViewportBox(): ViewportBox {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, left: 0, top: 0 }
  }
  const viewport = window.visualViewport
  return viewport
    ? {
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
        left: Math.round(viewport.offsetLeft),
        top: Math.round(viewport.offsetTop),
      }
    : {
        width: window.innerWidth,
        height: window.innerHeight,
        left: 0,
        top: 0,
      }
}

function availableWindowSize(viewport: ViewportBox, margin: number) {
  return {
    width: Math.max(1, viewport.width - margin * 2),
    height: Math.max(1, viewport.height - margin * 2),
  }
}

function defaultDesktopWindowState(viewport: ViewportBox): DesktopWindowState {
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

function clampDesktopWindowState(
  state: DesktopWindowState,
  viewport: ViewportBox,
): DesktopWindowState {
  const available = availableWindowSize(viewport, WINDOW_MARGIN_PX)
  const minWidth = Math.min(MIN_WINDOW_WIDTH_PX, available.width)
  const minHeight = Math.min(MIN_WINDOW_HEIGHT_PX, available.height)
  const width = clamp(state.width, minWidth, available.width)
  const height = clamp(state.height, minHeight, available.height)
  const x = clamp(
    state.x,
    viewport.left + WINDOW_MARGIN_PX,
    Math.max(
      viewport.left + WINDOW_MARGIN_PX,
      viewport.left + viewport.width - width - WINDOW_MARGIN_PX,
    ),
  )
  const y = clamp(
    state.y,
    viewport.top + WINDOW_MARGIN_PX,
    Math.max(
      viewport.top + WINDOW_MARGIN_PX,
      viewport.top + viewport.height - height - WINDOW_MARGIN_PX,
    ),
  )
  return { width, height, x, y }
}

function parseStoredWindowState(raw: string | null): DesktopWindowState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DesktopWindowState>
    if (
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number' ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number'
    ) {
      return null
    }
    return {
      width: parsed.width,
      height: parsed.height,
      x: parsed.x,
      y: parsed.y,
    }
  } catch {
    return null
  }
}

function loadDesktopWindowState(): DesktopWindowState | null {
  if (typeof window === 'undefined') return null
  return parseStoredWindowState(window.localStorage.getItem(WINDOW_STORAGE_KEY))
}

function resolveInitialDesktopWindowState(): DesktopWindowState | null {
  if (!isDesktopViewport()) return null
  const viewport = currentViewportBox()
  const stored = loadDesktopWindowState()
  const fallback = defaultDesktopWindowState(viewport)
  return clampDesktopWindowState(stored ?? fallback, viewport)
}

export function RulesPanel({
  onClose,
  initialDocId,
  initialTab,
  gameId,
  useUpgrades,
  useVanguards,
}: RulesPanelProps) {
  const [isDesktop, setIsDesktop] = useState(() => isDesktopViewport())
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState | null>(() =>
    resolveInitialDesktopWindowState(),
  )
  const [interaction, setInteraction] = useState<InteractionState>(null)

  const resetDesktopWindow = useCallback(() => {
    if (typeof window === 'undefined') return
    setDesktopWindow(defaultDesktopWindowState(currentViewportBox()))
  }, [])

  const stopInteraction = useCallback(() => {
    setInteraction(null)
  }, [])

  const beginDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop || !desktopWindow) return
    event.preventDefault()
    setInteraction({
      type: 'drag',
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: desktopWindow.x,
      startY: desktopWindow.y,
    })
  }, [desktopWindow, isDesktop])

  const beginResize = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDesktop || !desktopWindow) return
    event.preventDefault()
    event.stopPropagation()
    setInteraction({
      type: 'resize',
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startWidth: desktopWindow.width,
      startHeight: desktopWindow.height,
    })
  }, [desktopWindow, isDesktop])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    const syncViewport = () => {
      const desktop = isDesktopViewport()
      setIsDesktop(desktop)
      if (!desktop) {
        stopInteraction()
        return
      }
      const viewport = currentViewportBox()
      setDesktopWindow((previous) => {
        const fallback =
          previous ??
          loadDesktopWindowState() ??
          defaultDesktopWindowState(viewport)
        return clampDesktopWindowState(fallback, viewport)
      })
    }

    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
    }
  }, [stopInteraction])

  useEffect(() => {
    if (!isDesktop || !desktopWindow) return
    try {
      window.localStorage.setItem(WINDOW_STORAGE_KEY, JSON.stringify(desktopWindow))
    } catch {
      // Best effort only.
    }
  }, [desktopWindow, isDesktop])

  useEffect(() => {
    if (!interaction || !isDesktop) return

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = interaction.type === 'drag' ? 'grabbing' : 'se-resize'

    const handlePointerMove = (event: PointerEvent) => {
      setDesktopWindow((previous) => {
        const viewport = currentViewportBox()
        const current =
          previous ??
          defaultDesktopWindowState(viewport)
        if (interaction.type === 'drag') {
          const x = interaction.startX + (event.clientX - interaction.startPointerX)
          const y = interaction.startY + (event.clientY - interaction.startPointerY)
          return clampDesktopWindowState(
            { ...current, x, y },
            viewport,
          )
        }
        const width = interaction.startWidth + (event.clientX - interaction.startPointerX)
        const height = interaction.startHeight + (event.clientY - interaction.startPointerY)
        return clampDesktopWindowState(
          { ...current, width, height },
          viewport,
        )
      })
    }

    const handlePointerUp = () => {
      setInteraction(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      document.body.style.userSelect = previousUserSelect
      document.body.style.cursor = previousCursor
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [interaction, isDesktop])

  if (!isDesktop) {
    return (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-8"
        onClick={onClose}
      >
        <div
          className="modal-chrome rounded-none sm:rounded-xl shadow-2xl border gold-border w-full h-full sm:h-[calc(100dvh-4rem)] sm:max-w-4xl flex flex-col overflow-hidden"
          onClick={(event) => event.stopPropagation()}
        >
          <QuickGuide
            key={`${initialDocId ?? ''}:${initialTab ?? ''}`}
            initialDocId={initialDocId}
            initialTab={initialTab}
            gameId={gameId}
            useUpgrades={useUpgrades}
            useVanguards={useVanguards}
            onClose={onClose}
          />
        </div>
      </div>
    )
  }

  const desktopViewport = currentViewportBox()
  const desktopPanel =
    desktopWindow ??
    resolveInitialDesktopWindowState() ??
    defaultDesktopWindowState(desktopViewport)

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="absolute pointer-events-auto modal-chrome rounded-xl shadow-2xl border gold-border flex flex-col overflow-hidden"
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          height: desktopPanel.height,
          maxWidth: Math.max(1, desktopViewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, desktopViewport.height - WINDOW_MARGIN_PX * 2),
          boxShadow:
            '0 36px 96px rgba(0, 0, 0, 0.72), 0 14px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 236, 181, 0.08)',
        }}
      >
        <div
          className={`flex items-center gap-3 px-4 py-2 shrink-0 bg-black/35 border-b border-[rgba(212,175,55,0.45)] select-none ${
            interaction?.type === 'drag' ? 'cursor-grabbing' : 'cursor-grab'
          }`}
          onPointerDown={beginDrag}
        >
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-300">Guide</div>
            <div className="text-[11px] text-gray-400">Drag window. Resize from the lower-right corner.</div>
          </div>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={resetDesktopWindow}
            className="btn btn-secondary py-1 px-2.5 text-xs shrink-0"
          >
            {RESET_LABEL}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="btn btn-secondary py-1 px-2.5 text-xs shrink-0"
          >
            Close
          </button>
        </div>
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <QuickGuide
            key={`${initialDocId ?? ''}:${initialTab ?? ''}`}
            initialDocId={initialDocId}
            initialTab={initialTab}
            gameId={gameId}
            useUpgrades={useUpgrades}
            useVanguards={useVanguards}
          />
        </div>
        <button
          type="button"
          aria-label="Resize guide window"
          onPointerDown={beginResize}
          className="absolute right-0 bottom-0 w-6 h-6 cursor-se-resize bg-transparent"
        />
      </div>
    </div>
  )
}
