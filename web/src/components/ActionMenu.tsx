import { useState } from 'react'
import type { Card as CardType, ZoneName, CardStateAction } from '../types'
import type { ZoneOwner } from '../dnd/types'
import { useFaceDown } from '../contexts/faceDownState'
import type { BattleSelectedCard } from '../pages/phases/Battle'
import { canUseBattleFaceDownAction, canUseBattleFlipAction } from '../utils/battleInteraction'

interface ActionMenuProps {
  selectedCard: BattleSelectedCard | null
  battle: {
    your_zones: {
      battlefield: CardType[]
      library: CardType[]
      tapped_card_ids: string[]
      face_down_card_ids: string[]
      counters: Record<string, Record<string, number>>
      attachments: Record<string, string[]>
    }
    opponent_zones: {
      battlefield: CardType[]
      library: CardType[]
      tapped_card_ids: string[]
      face_down_card_ids: string[]
      counters: Record<string, Record<string, number>>
      attachments: Record<string, string[]>
    }
    current_turn_name: string | null
    can_manipulate_opponent: boolean
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
  onDrawLibrary: () => void
  onShuffleLibrary: () => void
  onDrawOpponentLibrary: () => void
  onShuffleOpponentLibrary: () => void
  onPassTurn: () => void
  onRollDie: (sides: number) => void
  onClose: () => void
}

type SubmenuType = 'none' | 'addCounter' | 'removeCounter' | 'spawnToken' | 'attachTo' | 'moveTo' | 'rollDie'

const COUNTER_TYPES = ['+1/+1', '-1/-1', 'Loyalty', 'Charge', 'Custom']
const DIE_SIDES = [2, 4, 6, 8, 10, 12, 20]

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
  onDrawLibrary,
  onShuffleLibrary,
  onDrawOpponentLibrary,
  onShuffleOpponentLibrary,
  onPassTurn,
  onRollDie,
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
    onMove(selectedCard.card.id, selectedCard.zone, toZone, selectedCard.owner, selectedCard.owner)
    onClose()
  }

  const handleGeneralAction = (fn: () => void) => {
    fn()
    onClose()
  }

  const card = selectedCard?.card
  const zone = selectedCard?.zone
  const selectedOwner = selectedCard?.owner ?? 'player'
  const ownerZones = selectedOwner === 'player' ? battle.your_zones : battle.opponent_zones
  const onBattlefield = zone === 'battlefield'
  const isFaceDown = useFaceDown(card?.id ?? '')
  const isScrubbed = !card?.name

  const tappedCardIds = new Set(ownerZones.tapped_card_ids || [])
  const counters = card ? (ownerZones.counters?.[card.id] || {}) : {}
  const attachments = ownerZones.attachments || {}

  const isTapped = card ? tappedCardIds.has(card.id) : false
  const hasFlip = !!card?.flip_image_url
  const canFaceDown = canUseBattleFaceDownAction(selectedOwner, battle.can_manipulate_opponent)
  const canFlip = canUseBattleFlipAction(selectedOwner, isFaceDown, battle.can_manipulate_opponent)
  const hasTokens = (card?.tokens?.length ?? 0) > 0
  const hasCounters = Object.keys(counters).length > 0
  const isAttached = card ? Object.values(attachments).some(children => children.includes(card.id)) : false
  const attachableCards = onBattlefield ? ownerZones.battlefield.filter(c => c.id !== card?.id) : []
  const yourLibraryCount = battle.your_zones.library.length
  const opponentLibraryCount = battle.opponent_zones.library.length

  return (
    <>
      <div className="fixed inset-0 z-[86]" onClick={onClose} />
      <div
        className="fixed bottom-16 left-4 modal-chrome border gold-border rounded-lg shadow-xl py-1 min-w-[220px] max-h-[70vh] overflow-auto z-[87]"
        style={{ maxWidth: 280 }}
      >
        {card && (
          <>
            <div className="px-3 py-1.5 text-xs text-gray-400 border-b gold-divider truncate">
              {card.name}
            </div>

            {onBattlefield && (
              <MenuItem
                label={isTapped ? 'Untap' : 'Tap'}
                onClick={() => handleAction(isTapped ? 'untap' : 'tap')}
              />
            )}

            {hasFlip && !isScrubbed && canFlip && (
              <MenuItem
                label="Flip"
                onClick={() => handleAction('flip')}
              />
            )}

            {!isScrubbed && canFaceDown && (
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
                {zone !== 'library' && <MenuItem label="Library" onClick={() => handleMove('library')} />}
              </Submenu>
            )}

            {onBattlefield && (
              <>
                <MenuItem
                  label="Add Counter"
                  hasSubmenu
                  guideTarget="battle-action-add-counter"
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
                          for_opponent: selectedOwner === 'opponent',
                        })}
                      />
                    ))}
                  </Submenu>
                )}
              </>
            )}

            {!isScrubbed && (
              <MenuItem
                label="Make Copy Token"
                onClick={() => handleAction('copy_token')}
              />
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
        {yourLibraryCount > 0 && (
          <>
            <MenuItem label={`Draw from Library (${yourLibraryCount})`} onClick={() => handleGeneralAction(onDrawLibrary)} />
            <MenuItem label={`Shuffle Library (${yourLibraryCount})`} onClick={() => handleGeneralAction(onShuffleLibrary)} />
          </>
        )}
        {battle.can_manipulate_opponent && opponentLibraryCount > 0 && (
          <>
            <MenuItem label={`Draw Opp. Library (${opponentLibraryCount})`} onClick={() => handleGeneralAction(onDrawOpponentLibrary)} />
            <MenuItem label={`Shuffle Opp. Library (${opponentLibraryCount})`} onClick={() => handleGeneralAction(onShuffleOpponentLibrary)} />
          </>
        )}

        <MenuDivider />

        <MenuItem label="Create Treasure" onClick={() => handleGeneralAction(onCreateTreasure)} />
        <MenuItem
          label="Pass Turn"
          onClick={() => handleGeneralAction(onPassTurn)}
          disabled={!isYourTurn}
        />

        <MenuDivider />

        <MenuItem
          label="Roll a Die"
          hasSubmenu
          onClick={() => setSubmenu(submenu === 'rollDie' ? 'none' : 'rollDie')}
        />
        {submenu === 'rollDie' && (
          <Submenu>
            {DIE_SIDES.map(sides => (
              <MenuItem
                key={sides}
                label={`d${sides}`}
                onClick={() => {
                  onRollDie(sides)
                  onClose()
                }}
              />
            ))}
            <MenuItem
              label="Custom..."
              onClick={() => {
                const input = prompt('Number of sides:')
                if (input) {
                  const sides = parseInt(input, 10)
                  if (sides > 0) {
                    onRollDie(sides)
                    onClose()
                  }
                }
              }}
            />
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
  guideTarget,
}: {
  label: string
  onClick: () => void
  hasSubmenu?: boolean
  disabled?: boolean
  guideTarget?: string
}) {
  return (
    <button
      className={`
        w-full px-3 py-1.5 text-left text-sm flex items-center justify-between
        ${disabled ? 'text-gray-500 cursor-not-allowed' : 'text-white hover:bg-gray-700'}
      `}
      data-guide-target={guideTarget}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      <span>{label}</span>
      {hasSubmenu && <span className="text-gray-400">›</span>}
    </button>
  )
}

function MenuDivider() {
  return <div className="border-t gold-divider my-1" />
}

function Submenu({ children, maxHeight }: { children: React.ReactNode; maxHeight?: number }) {
  return (
    <div
      className="ml-2 pl-2 border-l gold-divider"
      style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
    >
      {children}
    </div>
  )
}
