import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import type { Card as CardType, ZoneName, CardStateAction } from '../../types'
import { useFaceDown } from '../../contexts/faceDownState'
import { canUseBattleFaceDownAction, canUseBattleFlipAction } from '../../utils/battleInteraction'
import { clampMenuToViewport, menuMaxHeight } from '../../utils/menuPosition'

interface CardActionMenuProps {
  card: CardType
  position: { x: number; y: number }
  zone: ZoneName
  isTapped: boolean
  isFlipped: boolean
  counters: Record<string, number>
  isAttached: boolean
  battlefieldCards: CardType[]
  isOpponent?: boolean
  canManipulateOpponent?: boolean
  onAction: (action: CardStateAction, data?: Record<string, unknown>) => void
  onMove: (toZone: ZoneName) => void
  onClose: () => void
}

type Submenu = 'none' | 'addCounter' | 'removeCounter' | 'spawnToken' | 'attachTo' | 'moveTo'

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'Loyalty', 'Charge', 'Custom']
const ATTACH_TO_MAX_HEIGHT = 200
const MOVE_TARGETS: { zone: ZoneName; label: string }[] = [
  { zone: 'hand', label: 'Hand' },
  { zone: 'battlefield', label: 'Battlefield' },
  { zone: 'graveyard', label: 'Graveyard' },
  { zone: 'exile', label: 'Exile' },
  { zone: 'library', label: 'Library' },
]

export function CardActionMenu({
  card,
  position,
  zone,
  isTapped,
  isFlipped,
  counters,
  isAttached,
  battlefieldCards,
  isOpponent = false,
  canManipulateOpponent = true,
  onAction,
  onMove,
  onClose,
}: CardActionMenuProps) {
  const isFaceDown = useFaceDown(card.id)
  const [submenu, setSubmenu] = useState<Submenu>('none')

  const menuRef = useRef<HTMLDivElement>(null)

  const onBattlefield = zone === 'battlefield'
  const moveTargets = MOVE_TARGETS.filter((target) => target.zone !== zone)
  const attachableCards = battlefieldCards.filter(c => c.id !== card.id)
  const tallestSubmenuRows = Math.max(
    moveTargets.length,
    onBattlefield ? COUNTER_TYPES.length : 0,
    onBattlefield ? Object.keys(counters).length : 0,
    onBattlefield ? card.tokens.length : 0,
  )
  const attachToRows = onBattlefield ? attachableCards.length : 0

  // A submenu opens under the row that was clicked. Moving the menu then would put a different row under the pointer,
  // so the menu is placed once, with room under it for its tallest submenu.
  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const rowHeight = node.querySelector<HTMLElement>('.menu-item')?.offsetHeight ?? 0
    const tallestSubmenu = Math.max(
      tallestSubmenuRows * rowHeight,
      Math.min(attachToRows * rowHeight, ATTACH_TO_MAX_HEIGHT),
    )
    const rect = node.getBoundingClientRect()
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const { x, y } = clampMenuToViewport(position, { width: rect.width, height: rect.height + tallestSubmenu }, viewport)
    node.style.left = `${x}px`
    node.style.top = `${y}px`
    node.style.maxHeight = `${menuMaxHeight(y, viewport)}px`
  }, [position, tallestSubmenuRows, attachToRows])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const owner = isOpponent ? 'opponent' : 'player'
  const canFaceDown = canUseBattleFaceDownAction(owner, canManipulateOpponent)
  const canFlip = canUseBattleFlipAction(owner, isFaceDown, canManipulateOpponent)
  const hasFlip = !!card.flip_image_url
  const hasTokens = card.tokens.length > 0
  const hasCounters = Object.keys(counters).length > 0

  const handleAction = (action: CardStateAction, data?: Record<string, unknown>) => {
    onAction(action, data)
    onClose()
  }

  const handleMove = (toZone: ZoneName) => {
    onMove(toZone)
    onClose()
  }

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    zIndex: 100,
    overflowY: 'auto',
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        ref={menuRef}
        style={menuStyle}
        className="modal-chrome border gold-border rounded-lg shadow-xl py-1 min-w-[160px] z-50"
      >
        {onBattlefield && (
          <>
            <MenuItem
              label={isTapped ? 'Untap' : 'Tap'}
              onClick={() => handleAction(isTapped ? 'untap' : 'tap')}
            />
            <MenuDivider />
          </>
        )}

        {hasFlip && canFlip && (
          <MenuItem
            label={isFlipped ? 'Flip to Front' : 'Flip to Back'}
            onClick={() => handleAction('flip')}
          />
        )}

        {canFaceDown && (
          <MenuItem
            label={isFaceDown ? 'Turn Face Up' : 'Turn Face Down'}
            onClick={() => handleAction('face_down')}
          />
        )}

        <MenuDivider />

        {onBattlefield && (
          <>
            <MenuItem
              label="Add Counter"
              hasSubmenu
              open={submenu === 'addCounter'}
              onClick={() => setSubmenu(submenu === 'addCounter' ? 'none' : 'addCounter')}
            />
            {submenu === 'addCounter' && (
              <Submenu>
                {COUNTER_TYPES.map(type => (
                  <MenuItem
                    key={type}
                    label={type === 'Custom' ? 'Custom...' : type}
                    onClick={() => {
                      if (type === 'Custom') {
                        const name = prompt('Enter counter name:')
                        if (name) {
                          handleAction('counter', { counter_type: name, delta: 1 })
                        }
                      } else {
                        handleAction('counter', { counter_type: type, delta: 1 })
                      }
                    }}
                  />
                ))}
              </Submenu>
            )}

            {hasCounters && (
              <>
                <MenuItem
                  label="Remove Counter"
                  hasSubmenu
                  open={submenu === 'removeCounter'}
                  onClick={() => setSubmenu(submenu === 'removeCounter' ? 'none' : 'removeCounter')}
                />
                {submenu === 'removeCounter' && (
                  <Submenu>
                    {Object.entries(counters).map(([type, count]) => (
                      <MenuItem
                        key={type}
                        label={`${type} (${count})`}
                        onClick={() => handleAction('counter', { counter_type: type, delta: -1 })}
                      />
                    ))}
                  </Submenu>
                )}
              </>
            )}

            <MenuDivider />
          </>
        )}

        {hasTokens && onBattlefield && (
          <>
            <MenuItem
              label="Spawn Token"
              hasSubmenu
              open={submenu === 'spawnToken'}
              onClick={() => setSubmenu(submenu === 'spawnToken' ? 'none' : 'spawnToken')}
            />
            {submenu === 'spawnToken' && (
              <Submenu>
                {card.tokens.map(token => (
                  <MenuItem
                    key={token.id}
                    label={token.name}
                    onClick={() => handleAction('spawn', {
                      token: {
                        name: token.name,
                        image_url: token.image_url,
                        type_line: token.type_line,
                      },
                      for_opponent: isOpponent,
                    })}
                  />
                ))}
              </Submenu>
            )}
            <MenuDivider />
          </>
        )}

        {card.name && (
          <>
            <MenuItem
              label="Make Copy Token"
              onClick={() => handleAction('copy_token')}
            />
            <MenuDivider />
          </>
        )}

        {onBattlefield && attachableCards.length > 0 && (
          <>
            <MenuItem
              label="Attach To"
              hasSubmenu
              open={submenu === 'attachTo'}
              onClick={() => setSubmenu(submenu === 'attachTo' ? 'none' : 'attachTo')}
            />
            {submenu === 'attachTo' && (
              <Submenu maxHeight={ATTACH_TO_MAX_HEIGHT}>
                {attachableCards.map(target => (
                  <MenuItem
                    key={target.id}
                    label={target.name}
                    onClick={() => handleAction('attach', { parent_id: target.id })}
                  />
                ))}
              </Submenu>
            )}
          </>
        )}

        {isAttached && (
          <MenuItem
            label="Detach"
            onClick={() => handleAction('detach')}
          />
        )}

        {(onBattlefield && attachableCards.length > 0) || isAttached ? <MenuDivider /> : null}

        <MenuItem
          label="Move To"
          hasSubmenu
          open={submenu === 'moveTo'}
          onClick={() => setSubmenu(submenu === 'moveTo' ? 'none' : 'moveTo')}
        />
        {submenu === 'moveTo' && (
          <Submenu>
            {moveTargets.map((target) => (
              <MenuItem key={target.zone} label={target.label} onClick={() => handleMove(target.zone)} />
            ))}
          </Submenu>
        )}
      </div>
    </>
  )
}

function MenuItem({
  label,
  onClick,
  hasSubmenu,
  open,
  disabled,
}: {
  label: string
  onClick: () => void
  hasSubmenu?: boolean
  open?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
        menu-item ${disabled ? 'text-[var(--ivory-faint)] cursor-not-allowed' : 'text-white'}
      `}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-expanded={hasSubmenu ? open : undefined}
    >
      <span>{label}</span>
      {hasSubmenu && <span className="text-[var(--ivory-muted)]">›</span>}
    </button>
  )
}

function MenuDivider() {
  return <div className="border-t gold-divider my-1" />
}

function Submenu({ children, maxHeight }: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <div
      className="menu-submenu"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {children}
    </div>
  )
}
