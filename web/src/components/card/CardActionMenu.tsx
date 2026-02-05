import { useState, useCallback } from 'react'
import type { Card as CardType, ZoneName, CardStateAction } from '../../types'

interface CardActionMenuProps {
  card: CardType
  position: { x: number; y: number }
  zone: ZoneName
  isTapped: boolean
  isFlipped: boolean
  isFaceDown: boolean
  counters: Record<string, number>
  isAttached: boolean
  battlefieldCards: CardType[]
  isOpponent?: boolean
  onAction: (action: CardStateAction, data?: Record<string, unknown>) => void
  onMove: (toZone: ZoneName) => void
  onClose: () => void
}

type Submenu = 'none' | 'addCounter' | 'removeCounter' | 'spawnToken' | 'attachTo' | 'moveTo'

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'Loyalty', 'Charge', 'Custom']

export function CardActionMenu({
  card,
  position,
  zone,
  isTapped,
  isFlipped,
  isFaceDown,
  counters,
  isAttached,
  battlefieldCards,
  isOpponent = false,
  onAction,
  onMove,
  onClose,
}: CardActionMenuProps) {
  const [submenu, setSubmenu] = useState<Submenu>('none')

  const menuRef = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect()
      const padding = 8
      let x = position.x
      let y = position.y

      if (position.x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - padding
      }
      if (position.y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - padding
      }
      x = Math.max(padding, x)
      y = Math.max(padding, y)

      node.style.left = `${x}px`
      node.style.top = `${y}px`
    }
  }, [position])

  const onBattlefield = zone === 'battlefield'
  const hasFlip = !!card.flip_image_url
  const hasTokens = card.tokens.length > 0
  const hasCounters = Object.keys(counters).length > 0
  const attachableCards = battlefieldCards.filter(c => c.id !== card.id)

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
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px] z-50"
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

        {hasFlip && (
          <MenuItem
            label={isFlipped ? 'Flip to Front' : 'Flip to Back'}
            onClick={() => handleAction('flip')}
          />
        )}

        {onBattlefield && (
          <MenuItem
            label={isFaceDown ? 'Turn Face Up' : 'Turn Face Down'}
            onClick={() => handleAction('face_down')}
          />
        )}

        {(hasFlip || onBattlefield) && <MenuDivider />}

        {onBattlefield && (
          <>
            <MenuItem
              label="Add Counter"
              hasSubmenu
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

        {onBattlefield && attachableCards.length > 0 && (
          <>
            <MenuItem
              label="Attach To"
              hasSubmenu
              onClick={() => setSubmenu(submenu === 'attachTo' ? 'none' : 'attachTo')}
            />
            {submenu === 'attachTo' && (
              <Submenu maxHeight={200}>
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
          onClick={() => setSubmenu(submenu === 'moveTo' ? 'none' : 'moveTo')}
        />
        {submenu === 'moveTo' && (
          <Submenu>
            {zone !== 'hand' && <MenuItem label="Hand" onClick={() => handleMove('hand')} />}
            {zone !== 'battlefield' && <MenuItem label="Battlefield" onClick={() => handleMove('battlefield')} />}
            {zone !== 'graveyard' && <MenuItem label="Graveyard" onClick={() => handleMove('graveyard')} />}
            {zone !== 'exile' && <MenuItem label="Exile" onClick={() => handleMove('exile')} />}
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
  disabled,
}: {
  label: string
  onClick: () => void
  hasSubmenu?: boolean
  disabled?: boolean
}) {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
        ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-gray-700'}
      `}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span>{label}</span>
      {hasSubmenu && <span className="text-gray-400">›</span>}
    </button>
  )
}

function MenuDivider() {
  return <div className="border-t border-gray-700 my-1" />
}

function Submenu({ children, maxHeight }: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <div
      className="ml-2 pl-2 border-l border-gray-700"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {children}
    </div>
  )
}
