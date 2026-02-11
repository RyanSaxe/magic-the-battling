import { useState, useCallback } from 'react'
import type { Card as CardType, ZoneName, CardStateAction } from '../types'
import type { ZoneOwner } from '../dnd/types'
import type { BattleSelectedCard } from '../pages/phases/Battle'

interface ActionMenuProps {
  selectedCard: BattleSelectedCard | null
  battle: {
    your_zones: {
      battlefield: CardType[]
      tapped_card_ids: string[]
      face_down_card_ids: string[]
      counters: Record<string, Record<string, number>>
      attachments: Record<string, string[]>
    }
    opponent_zones: {
      battlefield: CardType[]
      tapped_card_ids: string[]
    }
    current_turn_name: string | null
  }
  playerName: string
  sideboardCount: number
  opponentSideboardCount: number
  onAction: (action: CardStateAction, cardId: string, data?: Record<string, unknown>) => void
  onMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName, fromOwner: ZoneOwner, toOwner: ZoneOwner) => void
  onUntapAll: () => void
  onUntapOpponentAll: () => void
  onShowSideboard: () => void
  onShowOpponentSideboard: () => void
  onCreateTreasure: () => void
  onPassTurn: () => void
  onClose: () => void
}

type SubmenuType = 'none' | 'addCounter' | 'removeCounter' | 'spawnToken' | 'attachTo' | 'moveTo'

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'Loyalty', 'Charge', 'Custom']

export function ActionMenu({
  selectedCard,
  battle,
  playerName,
  sideboardCount,
  opponentSideboardCount,
  onAction,
  onMove,
  onUntapAll,
  onUntapOpponentAll,
  onShowSideboard,
  onShowOpponentSideboard,
  onCreateTreasure,
  onPassTurn,
  onClose,
}: ActionMenuProps) {
  const [submenu, setSubmenu] = useState<SubmenuType>('none')

  const isYourTurn = battle.current_turn_name === playerName

  const handleAction = (action: CardStateAction, data?: Record<string, unknown>) => {
    if (!selectedCard) return
    onAction(action, selectedCard.card.id, data)
    onClose()
  }

  const handleMove = (toZone: ZoneName) => {
    if (!selectedCard) return
    onMove(selectedCard.card.id, selectedCard.zone, toZone, 'player', 'player')
    onClose()
  }

  const handleGeneralAction = (fn: () => void) => {
    fn()
    onClose()
  }

  const menuRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const rect = node.getBoundingClientRect()
    if (rect.top < 0) {
      node.style.bottom = 'auto'
      node.style.top = '8px'
    }
  }, [])

  const card = selectedCard?.card
  const zone = selectedCard?.zone
  const onBattlefield = zone === 'battlefield'

  const tappedCardIds = new Set(battle.your_zones.tapped_card_ids || [])
  const faceDownCardIds = new Set(battle.your_zones.face_down_card_ids || [])
  const counters = card ? (battle.your_zones.counters?.[card.id] || {}) : {}
  const attachments = battle.your_zones.attachments || {}

  const isTapped = card ? tappedCardIds.has(card.id) : false
  const isFaceDown = card ? faceDownCardIds.has(card.id) : false
  const hasFlip = !!card?.flip_image_url
  const hasTokens = (card?.tokens?.length ?? 0) > 0
  const hasCounters = Object.keys(counters).length > 0
  const isAttached = card ? Object.values(attachments).some(children => children.includes(card.id)) : false
  const attachableCards = onBattlefield ? battle.your_zones.battlefield.filter(c => c.id !== card?.id) : []

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed bottom-16 right-4 sm:right-auto sm:bottom-auto bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[220px] max-h-[70vh] overflow-auto z-50"
        style={{ maxWidth: 280 }}
      >
        {card && (
          <>
            <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700 truncate">
              {card.name}
            </div>

            {onBattlefield && (
              <MenuItem
                label={isTapped ? 'Untap' : 'Tap'}
                onClick={() => handleAction(isTapped ? 'untap' : 'tap')}
              />
            )}

            {hasFlip && (
              <MenuItem
                label="Flip"
                onClick={() => handleAction('flip')}
              />
            )}

            {onBattlefield && (
              <MenuItem
                label={isFaceDown ? 'Turn Face Up' : 'Turn Face Down'}
                onClick={() => handleAction('face_down')}
              />
            )}

            <MenuDivider />

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
                            if (name) handleAction('counter', { counter_type: name, delta: 1 })
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
                          for_opponent: false,
                        })}
                      />
                    ))}
                  </Submenu>
                )}
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

            <MenuDivider />
          </>
        )}

        <MenuItem label="Untap Your Permanents" onClick={() => handleGeneralAction(onUntapAll)} />
        <MenuItem label="Untap Opponent's Permanents" onClick={() => handleGeneralAction(onUntapOpponentAll)} />

        {sideboardCount > 0 && (
          <MenuItem label={`View Your Sideboard (${sideboardCount})`} onClick={() => handleGeneralAction(onShowSideboard)} />
        )}
        {opponentSideboardCount > 0 && (
          <MenuItem label={`View Opp. Sideboard (${opponentSideboardCount})`} onClick={() => handleGeneralAction(onShowOpponentSideboard)} />
        )}

        <MenuDivider />

        <MenuItem label="Create Treasure" onClick={() => handleGeneralAction(onCreateTreasure)} />
        <MenuItem
          label="Pass Turn"
          onClick={() => handleGeneralAction(onPassTurn)}
          disabled={!isYourTurn}
        />
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
