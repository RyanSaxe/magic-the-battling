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

function defaultDesktopWindowState(viewportWidth: number, viewportHeight: number): DesktopWindowState {
  const width = Math.min(
    DEFAULT_WINDOW_WIDTH_PX,
    Math.max(MIN_WINDOW_WIDTH_PX, viewportWidth - DEFAULT_OUTER_MARGIN_PX * 2),
  )
  const height = Math.min(
    DEFAULT_WINDOW_HEIGHT_PX,
    Math.max(MIN_WINDOW_HEIGHT_PX, viewportHeight - DEFAULT_OUTER_MARGIN_PX * 2),
  )
  return {
    width,
    height,
    x: Math.round((viewportWidth - width) / 2),
    y: Math.round((viewportHeight - height) / 2),
  }
}

function clampDesktopWindowState(
  state: DesktopWindowState,
  viewportWidth: number,
  viewportHeight: number,
): DesktopWindowState {
  const maxWidth = Math.max(MIN_WINDOW_WIDTH_PX, viewportWidth - WINDOW_MARGIN_PX * 2)
  const maxHeight = Math.max(MIN_WINDOW_HEIGHT_PX, viewportHeight - WINDOW_MARGIN_PX * 2)
  const width = clamp(state.width, MIN_WINDOW_WIDTH_PX, maxWidth)
  const height = clamp(state.height, MIN_WINDOW_HEIGHT_PX, maxHeight)
  const x = clamp(
    state.x,
    WINDOW_MARGIN_PX,
    Math.max(WINDOW_MARGIN_PX, viewportWidth - width - WINDOW_MARGIN_PX),
  )
  const y = clamp(
    state.y,
    WINDOW_MARGIN_PX,
    Math.max(WINDOW_MARGIN_PX, viewportHeight - height - WINDOW_MARGIN_PX),
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
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const stored = loadDesktopWindowState()
  const fallback = defaultDesktopWindowState(viewportWidth, viewportHeight)
  return clampDesktopWindowState(stored ?? fallback, viewportWidth, viewportHeight)
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
    setDesktopWindow(defaultDesktopWindowState(window.innerWidth, window.innerHeight))
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
    const onResize = () => {
      const desktop = isDesktopViewport()
      setIsDesktop(desktop)
      if (!desktop) {
        stopInteraction()
        return
      }
      setDesktopWindow((previous) => {
        const fallback =
          previous ??
          loadDesktopWindowState() ??
          defaultDesktopWindowState(window.innerWidth, window.innerHeight)
        return clampDesktopWindowState(fallback, window.innerWidth, window.innerHeight)
      })
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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
        const current =
          previous ??
          defaultDesktopWindowState(window.innerWidth, window.innerHeight)
        if (interaction.type === 'drag') {
          const x = interaction.startX + (event.clientX - interaction.startPointerX)
          const y = interaction.startY + (event.clientY - interaction.startPointerY)
          return clampDesktopWindowState(
            { ...current, x, y },
            window.innerWidth,
            window.innerHeight,
          )
        }
        const width = interaction.startWidth + (event.clientX - interaction.startPointerX)
        const height = interaction.startHeight + (event.clientY - interaction.startPointerY)
        return clampDesktopWindowState(
          { ...current, width, height },
          window.innerWidth,
          window.innerHeight,
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

  const desktopPanel =
    desktopWindow ?? resolveInitialDesktopWindowState() ?? defaultDesktopWindowState(window.innerWidth, window.innerHeight)

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        className="absolute pointer-events-auto modal-chrome rounded-xl shadow-2xl border gold-border flex flex-col overflow-hidden"
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          height: desktopPanel.height,
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
        <div className="flex-1 min-h-0">
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
        >
          <span className="absolute right-1 bottom-1 block w-3 h-3 border-r border-b border-amber-300/80" />
          <span className="absolute right-2 bottom-2 block w-2 h-2 border-r border-b border-amber-300/40" />
        </button>
      </div>
    </div>
  )
}
