import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { QuickGuide } from './QuickGuide'
import {
  DESKTOP_BREAKPOINT_PX,
  DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  WINDOW_MARGIN_PX,
  clampDesktopPanelOrigin,
  clampDesktopWindowForMode,
  clampDesktopWindowState,
  collapsedPanelSize,
  defaultDesktopWindowState,
  getDesktopPanelRect,
  parseStoredWindowState,
  serializeStoredWindowState,
  type DesktopWindowState,
  type ViewportBox,
} from './rulesPanelWindow'

export interface RulesPanelTarget {
  docId?: string
  tab?: string
}

interface RulesPanelProps {
  onClose: () => void
  initialDocId?: string
  initialTab?: string
  gameId?: string
  playerName?: string
  useUpgrades?: boolean
  useVanguards?: boolean
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

interface WindowControlButtonProps {
  ariaLabel: string
  title: string
  colorClassName: string
  onClick: () => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  disabled?: boolean
}

const WINDOW_STORAGE_KEY = 'mtb_rules_panel_window:v2'
const LEGACY_WINDOW_STORAGE_KEY = 'mtb_rules_panel_window:v1'
const MOBILE_PANEL_TOP_GAP_PX = 48
const MOBILE_PANEL_BOTTOM_GAP_PX = 24
const MOBILE_PANEL_MIN_HEIGHT_PX = 280
const MOBILE_PANEL_MAX_WIDTH_PX = 720
const MOBILE_COLLAPSED_LABEL_FALLBACK = 'Rules'

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT_PX
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

function sameWindowState(a: DesktopWindowState | null, b: DesktopWindowState | null): boolean {
  return !!a && !!b &&
    a.width === b.width &&
    a.height === b.height &&
    a.x === b.x &&
    a.y === b.y
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function loadStoredWindowState() {
  if (typeof window === 'undefined') {
    return null
  }
  return parseStoredWindowState(
    window.localStorage.getItem(WINDOW_STORAGE_KEY)
    ?? window.localStorage.getItem(LEGACY_WINDOW_STORAGE_KEY),
  )
}

function resolveInitialDesktopWindowState(): DesktopWindowState | null {
  if (!isDesktopViewport()) {
    return null
  }
  const viewport = currentViewportBox()
  const stored = loadStoredWindowState()
  return clampDesktopWindowForMode(
    stored?.windowState ?? defaultDesktopWindowState(viewport),
    viewport,
    stored?.isCollapsed ?? false,
    DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
  )
}

function resolveInitialCollapsedState(): boolean {
  return loadStoredWindowState()?.isCollapsed ?? false
}

function defaultMobileCollapsedOrigin(viewport: ViewportBox, collapsedHeight: number) {
  const panel = collapsedPanelSize(viewport, collapsedHeight)
  return clampDesktopPanelOrigin(
    Math.round(viewport.left + (viewport.width - panel.width) / 2),
    viewport.top + WINDOW_MARGIN_PX,
    panel,
    viewport,
  )
}

function WindowControlButton({
  ariaLabel,
  title,
  colorClassName,
  onClick,
  onPointerDown,
  disabled = false,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      className={`h-3.5 w-3.5 rounded-full border border-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] transition-opacity ${
        disabled ? `${colorClassName} cursor-default opacity-45` : `${colorClassName} hover:opacity-90`
      }`}
    />
  )
}

export function RulesPanel({
  onClose,
  initialDocId,
  initialTab,
  gameId,
  playerName,
  useUpgrades,
  useVanguards,
}: RulesPanelProps) {
  const [isDesktop, setIsDesktop] = useState(() => isDesktopViewport())
  const [desktopWindow, setDesktopWindow] = useState<DesktopWindowState | null>(() =>
    resolveInitialDesktopWindowState(),
  )
  const [isCollapsed, setIsCollapsed] = useState(() => resolveInitialCollapsedState())
  const [navigationHint, setNavigationHint] = useState(MOBILE_COLLAPSED_LABEL_FALLBACK)
  const [mobileCollapsedOrigin, setMobileCollapsedOrigin] = useState<{ x: number; y: number } | null>(null)
  const [interaction, setInteraction] = useState<InteractionState>(null)
  const [collapsedPanelHeight, setCollapsedPanelHeight] = useState(DEFAULT_COLLAPSED_PANEL_HEIGHT_PX)
  const collapsedPanelRef = useRef<HTMLDivElement | null>(null)

  const stopInteraction = useCallback(() => {
    setInteraction(null)
  }, [])

  const desktopViewport = isDesktop ? currentViewportBox() : null
  const resolvedDesktopWindow = isDesktop && desktopViewport
    ? clampDesktopWindowForMode(
        desktopWindow ?? defaultDesktopWindowState(desktopViewport),
        desktopViewport,
        isCollapsed,
        collapsedPanelHeight,
      )
    : null
  const desktopPanel = resolvedDesktopWindow && desktopViewport
    ? getDesktopPanelRect(resolvedDesktopWindow, desktopViewport, isCollapsed, collapsedPanelHeight)
    : null
  const mobileViewport = !isDesktop ? currentViewportBox() : null
  const mobileCollapsedRect = mobileViewport
    ? (() => {
        const panel = collapsedPanelSize(mobileViewport, collapsedPanelHeight)
        const origin = mobileCollapsedOrigin ?? defaultMobileCollapsedOrigin(mobileViewport, collapsedPanelHeight)
        return {
          width: panel.width,
          height: panel.height,
          ...clampDesktopPanelOrigin(origin.x, origin.y, panel, mobileViewport),
        }
      })()
    : null

  const syncDesktopWindow = useCallback((collapsed: boolean) => {
    if (!isDesktopViewport()) {
      return
    }
    const viewport = currentViewportBox()
    setDesktopWindow((previous) => {
      const fallback = previous ?? loadStoredWindowState()?.windowState ?? defaultDesktopWindowState(viewport)
      const next = clampDesktopWindowForMode(fallback, viewport, collapsed, collapsedPanelHeight)
      return sameWindowState(previous, next) ? previous : next
    })
  }, [collapsedPanelHeight])

  const handleCollapse = useCallback(() => {
    stopInteraction()
    if (isDesktopViewport()) {
      syncDesktopWindow(true)
    }
    setIsCollapsed(true)
  }, [stopInteraction, syncDesktopWindow])

  const handleRestore = useCallback(() => {
    stopInteraction()
    if (isDesktopViewport()) {
      syncDesktopWindow(false)
    }
    setIsCollapsed(false)
  }, [stopInteraction, syncDesktopWindow])

  const resetWindow = useCallback(() => {
    stopInteraction()
    setIsCollapsed(false)
    if (!isDesktopViewport()) {
      return
    }
    setDesktopWindow(defaultDesktopWindowState(currentViewportBox()))
  }, [stopInteraction])

  const handleGreenControl = useCallback(() => {
    if (isCollapsed) {
      handleRestore()
      return
    }
    resetWindow()
  }, [handleRestore, isCollapsed, resetWindow])

  const handleControlPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  const beginDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isDesktop) {
      if (!desktopPanel) {
        return
      }
      event.preventDefault()
      setInteraction({
        type: 'drag',
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: desktopPanel.x,
        startY: desktopPanel.y,
      })
      return
    }

    if (!isCollapsed || !mobileCollapsedRect) {
      return
    }
    event.preventDefault()
    setInteraction({
      type: 'drag',
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: mobileCollapsedRect.x,
      startY: mobileCollapsedRect.y,
    })
  }, [desktopPanel, isCollapsed, isDesktop, mobileCollapsedRect])

  const beginResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isDesktop || !desktopPanel || isCollapsed) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    setInteraction({
      type: 'resize',
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startWidth: desktopPanel.width,
      startHeight: desktopPanel.height,
    })
  }, [desktopPanel, isCollapsed, isDesktop])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
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
      syncDesktopWindow(isCollapsed)
    }

    window.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('resize', syncViewport)
    window.visualViewport?.addEventListener('scroll', syncViewport)
    return () => {
      window.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('resize', syncViewport)
      window.visualViewport?.removeEventListener('scroll', syncViewport)
    }
  }, [isCollapsed, stopInteraction, syncDesktopWindow])

  useLayoutEffect(() => {
    if (!isCollapsed) {
      return
    }

    const node = collapsedPanelRef.current
    if (!node) {
      return
    }

    const updateHeight = () => {
      const nextHeight = Math.max(
        DEFAULT_COLLAPSED_PANEL_HEIGHT_PX,
        Math.ceil(node.getBoundingClientRect().height),
      )
      setCollapsedPanelHeight((previous) => (previous === nextHeight ? previous : nextHeight))
    }

    updateHeight()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => {
      updateHeight()
    })
    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [isCollapsed, navigationHint])

  useEffect(() => {
    if (!desktopWindow) {
      return
    }
    try {
      window.localStorage.setItem(
        WINDOW_STORAGE_KEY,
        serializeStoredWindowState({
          windowState: desktopWindow,
          isCollapsed,
        }),
      )
    } catch {
      // Best effort only.
    }
  }, [desktopWindow, isCollapsed])

  useEffect(() => {
    if (!interaction || (!isDesktop && !isCollapsed)) {
      return
    }

    const previousUserSelect = document.body.style.userSelect
    const previousCursor = document.body.style.cursor
    document.body.style.userSelect = 'none'
    document.body.style.cursor = interaction.type === 'drag' ? 'grabbing' : 'se-resize'

    const handlePointerMove = (event: PointerEvent) => {
      if (!isDesktop) {
        if (interaction.type !== 'drag') {
          return
        }
        const viewport = currentViewportBox()
        const panel = collapsedPanelSize(viewport, collapsedPanelHeight)
        const nextX = interaction.startX + (event.clientX - interaction.startPointerX)
        const nextY = interaction.startY + (event.clientY - interaction.startPointerY)
        setMobileCollapsedOrigin(
          clampDesktopPanelOrigin(nextX, nextY, panel, viewport),
        )
        return
      }

      setDesktopWindow((previous) => {
        const viewport = currentViewportBox()
        const current = previous ?? defaultDesktopWindowState(viewport)

        if (interaction.type === 'drag') {
          const nextX = interaction.startX + (event.clientX - interaction.startPointerX)
          const nextY = interaction.startY + (event.clientY - interaction.startPointerY)

          if (isCollapsed) {
            const origin = clampDesktopPanelOrigin(
              nextX,
              nextY,
              collapsedPanelSize(viewport, collapsedPanelHeight),
              viewport,
            )
            return clampDesktopWindowForMode(
              {
                ...current,
                ...origin,
              },
              viewport,
              true,
              collapsedPanelHeight,
            )
          }

          return clampDesktopWindowState(
            {
              ...current,
              x: nextX,
              y: nextY,
            },
            viewport,
          )
        }

        const width = interaction.startWidth + (event.clientX - interaction.startPointerX)
        const height = interaction.startHeight + (event.clientY - interaction.startPointerY)
        return clampDesktopWindowState(
          {
            ...current,
            width,
            height,
          },
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
  }, [collapsedPanelHeight, interaction, isCollapsed, isDesktop])

  if (!isDesktop) {
    if (!mobileViewport) {
      return null
    }

    const expandedHeight = clamp(
      mobileViewport.height - MOBILE_PANEL_TOP_GAP_PX - MOBILE_PANEL_BOTTOM_GAP_PX,
      MOBILE_PANEL_MIN_HEIGHT_PX,
      Math.max(MOBILE_PANEL_MIN_HEIGHT_PX, mobileViewport.height - MOBILE_PANEL_BOTTOM_GAP_PX),
    )
    const expandedWidth = Math.min(MOBILE_PANEL_MAX_WIDTH_PX, mobileViewport.width - WINDOW_MARGIN_PX * 2)
    const expandedLeft = mobileViewport.left + Math.round((mobileViewport.width - expandedWidth) / 2)
    const collapsedLocation = navigationHint || MOBILE_COLLAPSED_LABEL_FALLBACK

    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div
          ref={isCollapsed ? collapsedPanelRef : null}
          className={`absolute pointer-events-auto modal-chrome felt-raised-panel border gold-border rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.55)] flex flex-col overflow-hidden ${
            interaction ? 'transition-none' : 'transition-[left,top,width,height] duration-200 ease-out'
          }`}
          style={{
            left: isCollapsed ? mobileCollapsedRect?.x : expandedLeft,
            top: isCollapsed ? mobileCollapsedRect?.y : mobileViewport.top + MOBILE_PANEL_TOP_GAP_PX,
            width: isCollapsed ? mobileCollapsedRect?.width : expandedWidth,
            height: isCollapsed ? undefined : expandedHeight,
            maxHeight: mobileViewport.height - WINDOW_MARGIN_PX * 2,
          }}
        >
          <div
            className={`relative flex items-center gap-3 px-4 py-3 shrink-0 select-none border-b border-[rgba(212,175,55,0.3)] bg-black/30 ${
              isCollapsed
                ? interaction?.type === 'drag'
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : ''
            }`}
            onPointerDown={beginDrag}
            style={{ touchAction: isCollapsed ? 'none' : undefined }}
          >
            <div className="flex items-center gap-2 shrink-0">
              <WindowControlButton
                ariaLabel="Close guide"
                title="Close"
                colorClassName="bg-[#ff5f57]"
                onClick={onClose}
                onPointerDown={handleControlPointerDown}
              />
              <WindowControlButton
                ariaLabel="Minimize guide"
                title="Minimize"
                colorClassName="bg-[#febc2e]"
                onClick={handleCollapse}
                onPointerDown={handleControlPointerDown}
                disabled={isCollapsed}
              />
              <WindowControlButton
                ariaLabel={isCollapsed ? 'Open guide' : 'Reset guide window'}
                title={isCollapsed ? 'Open' : 'Reset'}
                colorClassName="bg-[#28c840]"
                onClick={handleGreenControl}
                onPointerDown={handleControlPointerDown}
              />
            </div>
            <div className="absolute inset-x-0 flex justify-center pointer-events-none px-20">
              <span className="truncate text-[0.7rem] uppercase tracking-[0.2em] text-amber-100/70">
                Guide
              </span>
            </div>
          </div>

          {isCollapsed ? (
            <div className="flex flex-1 min-h-0 flex-col justify-center px-4 pb-3 pt-2">
              <span className="text-[0.58rem] uppercase tracking-[0.18em] text-amber-200/45">
                Current section
              </span>
              <span className="mt-1 text-sm font-medium leading-snug text-amber-50/95 break-words">
                {collapsedLocation}
              </span>
            </div>
          ) : (
            <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <QuickGuide
                key={`${initialDocId ?? ''}:${initialTab ?? ''}`}
                initialDocId={initialDocId}
                initialTab={initialTab}
                gameId={gameId}
                playerName={playerName}
                useUpgrades={useUpgrades}
                useVanguards={useVanguards}
                onLocationChange={setNavigationHint}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!desktopViewport || !desktopPanel) {
    return null
  }

  const collapsedLocation = navigationHint || MOBILE_COLLAPSED_LABEL_FALLBACK

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={isCollapsed ? collapsedPanelRef : null}
        className={`absolute pointer-events-auto modal-chrome felt-raised-panel border gold-border rounded-2xl flex flex-col overflow-hidden shadow-[0_36px_96px_rgba(0,0,0,0.72),0_14px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,236,181,0.08)] ${
          interaction ? 'transition-none' : 'transition-[left,top,width,height] duration-200 ease-out'
        }`}
        style={{
          left: desktopPanel.x,
          top: desktopPanel.y,
          width: desktopPanel.width,
          height: isCollapsed ? undefined : desktopPanel.height,
          maxWidth: Math.max(1, desktopViewport.width - WINDOW_MARGIN_PX * 2),
          maxHeight: Math.max(1, desktopViewport.height - WINDOW_MARGIN_PX * 2),
        }}
      >
        <div
          className={`relative flex items-center gap-3 px-4 py-3 shrink-0 select-none border-b border-[rgba(212,175,55,0.3)] bg-black/30 ${interaction?.type === 'drag' ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={beginDrag}
          style={{ touchAction: 'none' }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <WindowControlButton
              ariaLabel="Close guide"
              title="Close"
              colorClassName="bg-[#ff5f57]"
              onClick={onClose}
              onPointerDown={handleControlPointerDown}
            />
            <WindowControlButton
              ariaLabel="Minimize guide"
              title="Minimize"
              colorClassName="bg-[#febc2e]"
              onClick={handleCollapse}
              onPointerDown={handleControlPointerDown}
              disabled={isCollapsed}
            />
            <WindowControlButton
              ariaLabel={isCollapsed ? 'Open guide' : 'Reset guide window'}
              title={isCollapsed ? 'Open' : 'Reset'}
              colorClassName="bg-[#28c840]"
              onClick={handleGreenControl}
              onPointerDown={handleControlPointerDown}
            />
          </div>
          <div className="absolute inset-x-0 flex justify-center pointer-events-none px-28">
            <span className="truncate text-[0.7rem] uppercase tracking-[0.2em] text-amber-100/70">
              Guide
            </span>
          </div>
        </div>

        {isCollapsed ? (
          <div className="flex flex-1 min-h-0 flex-col justify-center px-4 pb-3 pt-2">
            <span className="text-[0.58rem] uppercase tracking-[0.18em] text-amber-200/45">
              Current section
            </span>
            <span className="mt-1 text-sm font-medium leading-snug text-amber-50/95 break-words">
              {collapsedLocation}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
            <QuickGuide
              key={`${initialDocId ?? ''}:${initialTab ?? ''}`}
              initialDocId={initialDocId}
              initialTab={initialTab}
              gameId={gameId}
              playerName={playerName}
              useUpgrades={useUpgrades}
              useVanguards={useVanguards}
              onLocationChange={setNavigationHint}
            />
          </div>
        )}

        {!isCollapsed && (
          <button
            type="button"
            aria-label="Resize guide window"
            title="Resize"
            onPointerDown={beginResize}
            className="absolute right-0 bottom-0 h-5 w-5 cursor-se-resize bg-transparent"
          />
        )}
      </div>
    </div>
  )
}
