import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { DashboardFrame } from '../components/dashboard/DashboardFrame'
import { DefaultOpponentsField } from '../components/dashboard/DefaultOpponentsField'
import { DeletePresetDialog } from '../components/dashboard/DeletePresetDialog'
import { DetailHero, HeroLink } from '../components/dashboard/DetailHero'
import { GameHistory, type LoadGames } from '../components/dashboard/GameHistory'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { Breadcrumb, NoticeTile } from '../components/dashboard/Section'
import { getBattler, getBattlerGames, updateBattler, deleteBattler } from '../api/client'
import { useFirstLoad } from '../hooks/useFirstLoad'
import type { UserBattler, PlayMode } from '../types'
import { countLabel, cubeTitle, modeLabel, winRate } from '../utils/accountFormat'
import { AppError, unknownToAppError } from '../utils/appError'
import { battlerPlayUrl } from '../utils/battlerPlayUrl'
import { FIELD_LABEL, OPTION_BOX, TEXT_INPUT } from '../components/common/styles'
import { Dialog } from '../components/common/Dialog'

export function BattlerView() {
  const { listId } = useParams<{ listId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()

  const [showSettings, setShowSettings] = useState(false)
  const presetId = Number(listId)
  // Resolves to null when the player has no such preset, which sends them back to the dashboard.
  const loadPreset = useCallback(async () => {
    if (!Number.isInteger(presetId)) return null
    try {
      return await getBattler(presetId)
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return null
      throw err
    }
  }, [presetId])
  const presetLoad = useFirstLoad(loadPreset, !!user)
  const battler = presetLoad.state.status === 'loaded' ? presetLoad.state.value : null
  const missing = presetLoad.state.status === 'loaded' && battler === null

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`, { replace: true })
    }
  }, [authLoading, user, navigate, location.pathname])

  useEffect(() => {
    if (missing) navigate('/dashboard', { replace: true })
  }, [missing, navigate])

  const battlerId = battler?.id
  const loadGames = useCallback<LoadGames>((filters, offset) => {
    if (battlerId === undefined) throw new Error('No battler')
    return getBattlerGames(battlerId, {
      offset,
      playMode: filters.playMode ?? undefined,
      useUpgrades: filters.useUpgrades ?? undefined,
      mineOnly: filters.mineOnly,
    })
  }, [battlerId])

  if (presetLoad.state.status === 'failed') {
    return (
      <PageFrame header={<HomeHeader />} center contentClassName="items-center">
        <NoticeTile action={{ label: 'Retry', onClick: presetLoad.retry }}>This preset didn&apos;t load.</NoticeTile>
      </PageFrame>
    )
  }

  if (authLoading || !user || !battler) {
    return (
      <PageFrame header={<HomeHeader />} center contentClassName="items-center">
        <p className="text-amber-200/70">Loading...</p>
      </PageFrame>
    )
  }

  const title = cubeTitle(battler)
  const mode = modeLabel(battler.play_mode)

  return (
    <>
      <DashboardFrame>
        <Breadcrumb to="/dashboard" label="Cubes & Decks" current={title} />
        <DetailHero
          imageUri={battler.cube_image_uri}
          badge={{ label: `Saved ${mode} Preset`, tone: mode }}
          title={title}
          links={<>
            <span>
              Source:{' '}
              <HeroLink href={`https://cubecobra.com/cube/overview/${encodeURIComponent(battler.cube_id)}`}>
                {battler.cube_id} on CubeCobra ↗
              </HeroLink>
            </span>
            <HeroLink to={`/cube/${encodeURIComponent(battler.cube_id)}`}>View Public Cube Page →</HeroLink>
          </>}
          details={[
            { label: 'Mode', value: mode === 'Deck' ? 'Deck (Constructed)' : 'Cube (Limited)' },
            { label: 'Upgrades', value: battler.use_upgrades ? 'On' : 'Off' },
            { label: 'Default Opponents', value: String(battler.puppet_count) },
            { label: 'Open Spectating', value: battler.auto_approve_spectators ? 'On' : 'Off' },
          ]}
          actions={[{ label: 'Edit', onClick: () => setShowSettings(true) }]}
          play={{ label: 'Play', onClick: () => navigate(battlerPlayUrl(battler)) }}
          stats={[
            { label: 'Your Games', value: battler.my_game_count },
            {
              label: 'Your Wins',
              value: battler.my_win_count,
              detail: battler.my_game_count > 0 ? `(${winRate(battler.my_win_count, battler.my_game_count)})` : undefined,
            },
            { label: 'Avg Finish', value: battler.my_average_placement?.toFixed(1) ?? '—' },
            {
              label: 'All Cube Games',
              value: battler.game_count,
              detail: <span className="block whitespace-nowrap">{countLabel(battler.human_player_count, 'player')}</span>,
            },
          ]}
          caption={`Your games, wins and finish count your finished games on this cube in ${mode} mode with upgrades ${battler.use_upgrades ? 'on' : 'off'}.`}
        />
        <GameHistory
          key={`${battler.play_mode}-${battler.use_upgrades}`}
          scoped
          loadGames={loadGames}
          initialFilters={{ playMode: battler.play_mode, useUpgrades: battler.use_upgrades, mineOnly: true }}
        />
      </DashboardFrame>

      {showSettings && (
        <SettingsModal
          battler={battler}
          onClose={() => setShowSettings(false)}
          onSave={async (updates) => {
            try {
              const updated = await updateBattler(battler.id, updates)
              presetLoad.update({ status: 'loaded', value: updated })
              setShowSettings(false)
            } catch (err) {
              addToast(unknownToAppError(err, 'update-battler', 'Failed to save').message, 'error')
            }
          }}
          onDelete={async () => {
            try {
              await deleteBattler(battler.id)
              navigate('/dashboard', { replace: true })
            } catch (err) {
              addToast(unknownToAppError(err, 'delete-battler', 'Failed to delete').message, 'error')
            }
          }}
        />
      )}
    </>
  )
}

function SettingsModal({
  battler,
  onClose,
  onSave,
  onDelete,
}: {
  battler: UserBattler
  onClose: () => void
  onSave: (updates: Record<string, unknown>) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(battler.display_name || '')
  const [useUpgrades, setUseUpgrades] = useState(battler.use_upgrades)
  const [playMode, setPlayMode] = useState<PlayMode>(battler.play_mode)
  const [puppetCount, setPuppetCount] = useState(battler.puppet_count)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({
      // The server takes a null as unchanged, so an empty name is how to clear it.
      display_name: displayName.trim(),
      use_upgrades: useUpgrades,
      play_mode: playMode,
      puppet_count: puppetCount,
      target_player_count: puppetCount + 1,
    })
    setSaving(false)
  }

  return (
    <>
      <Dialog title="Settings" onClose={onClose} onSubmit={handleSave}>

        <div className="space-y-3">
          <div>
            <label className={FIELD_LABEL}>Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={TEXT_INPUT}
              placeholder={battler.cube_id}
            />
          </div>

          <label className={`${OPTION_BOX} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}>
            <input
              type="checkbox"
              checked={playMode === 'constructed'}
              onChange={(e) => setPlayMode(e.target.checked ? 'constructed' : 'limited')}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">Constructed</span>
            <span className="text-[var(--ivory-muted)] text-xs">— bring your own deck</span>
          </label>

          <label className={`${OPTION_BOX} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}>
            <input
              type="checkbox"
              checked={useUpgrades}
              onChange={(e) => setUseUpgrades(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-white text-sm">Upgrades</span>
          </label>

          <DefaultOpponentsField value={puppetCount} onChange={setPuppetCount} />
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary flex-1 py-2 font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="btn btn-secondary btn-destructive py-2 px-4"
          >
            Delete
          </button>
        </div>
      </Dialog>

      {confirmingDelete && (
        <DeletePresetDialog
          title={cubeTitle(battler)}
          imageUri={battler.cube_image_uri}
          deleting={deleting}
          onKeep={() => setConfirmingDelete(false)}
          onDelete={async () => {
            setDeleting(true)
            await onDelete()
            setDeleting(false)
            setConfirmingDelete(false)
          }}
        />
      )}
    </>
  )
}
