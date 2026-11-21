import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { PageFrame } from '../components/common/PageFrame'
import { AddCubeModal } from '../components/dashboard/AddCubeModal'
import { DetailHero } from '../components/dashboard/DetailHero'
import { GameHistory, type LoadGames } from '../components/dashboard/GameHistory'
import { HomeHeader } from '../components/dashboard/HomeHeader'
import { Breadcrumb, PlayIcon, SectionTitle } from '../components/dashboard/Section'
import { followCube, getCubeGames, getCubeSummary, unfollowCube } from '../api/client'
import type { CubeSummary } from '../types'
import { formatWhen, modeLabel, upgradesLabel } from '../utils/accountFormat'
import { unknownToAppError } from '../utils/appError'

const ALL_GAMES = { playMode: null, useUpgrades: null, mineOnly: false }

export function CubeView() {
  const { cubeId = '' } = useParams<{ cubeId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [summary, setSummary] = useState<CubeSummary | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [changingFollow, setChangingFollow] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCubeSummary(cubeId)
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) addToast('Failed to load the cube', 'error')
      })
    return () => {
      cancelled = true
    }
  }, [cubeId, user, addToast])

  const loadGames = useCallback<LoadGames>(
    (filters, offset) =>
      getCubeGames(cubeId, {
        offset,
        playMode: filters.playMode ?? undefined,
        useUpgrades: filters.useUpgrades ?? undefined,
      }),
    [cubeId],
  )

  const toggleFollow = async () => {
    if (!summary) return
    setChangingFollow(true)
    try {
      if (summary.follow_id !== null) {
        await unfollowCube(summary.follow_id)
        setSummary({ ...summary, is_following: false, follow_id: null })
      } else {
        const follow = await followCube(cubeId)
        setSummary({ ...summary, is_following: true, follow_id: follow.id })
      }
    } catch (err) {
      addToast(unknownToAppError(err, 'follow-cube', 'Failed to change the follow').message, 'error')
    } finally {
      setChangingFollow(false)
    }
  }

  const title = summary?.cube_name ?? cubeId
  const setup = summary?.popular_setup

  return (
    <>
      <PageFrame header={<HomeHeader />} contentClassName="px-4">
        <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
          {user && <Breadcrumb to="/dashboard/discover" label="Discover Cubes" current={title} />}
          <DetailHero
            imageUri={summary?.cube_image_uri}
            badge={{ label: 'Community Cube', tone: 'Cube' }}
            title={title}
            links={<>
              <span>
                CubeCobra ID: <strong className="font-semibold text-amber-50">{cubeId}</strong>
              </span>
              <a
                href={`https://cubecobra.com/cube/list/${encodeURIComponent(cubeId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-400 hover:text-amber-300 transition-colors"
              >
                View Full Card List on CubeCobra ↗
              </a>
            </>}
            actions={<>
              {user && summary && (
                <>
                  <button
                    type="button"
                    onClick={toggleFollow}
                    disabled={changingFollow}
                    aria-pressed={summary.is_following}
                    className={`btn btn-secondary px-4 py-2 text-sm font-medium disabled:opacity-50 ${
                      summary.is_following ? 'text-emerald-300' : ''
                    }`}
                  >
                    {summary.is_following ? '✓ Following' : '+ Follow'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="btn btn-secondary px-4 py-2 text-sm font-medium"
                  >
                    + Save Preset
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`)}
                className="btn btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
              >
                <PlayIcon />
                Play Cube
              </button>
            </>}
            stats={[
              { label: 'Games Played', value: summary?.game_count ?? '—' },
              { label: 'Players', value: summary?.human_player_count ?? '—' },
              { label: 'Last Played', value: summary?.last_played ? formatWhen(summary.last_played) : '—' },
              { label: 'Popular Setup', value: setup ? `${modeLabel(setup.play_mode)} · ${upgradesLabel(setup.use_upgrades)}` : '—' },
            ]}
          />
          <GameHistory
            loadGames={loadGames}
            initialFilters={ALL_GAMES}
            title={(total) => (
              <SectionTitle>Community Game History{total !== null ? ` (${total})` : ''}</SectionTitle>
            )}
          />
        </div>
      </PageFrame>

      {showSaveModal && (
        <AddCubeModal
          initialCubeId={cubeId}
          onClose={() => setShowSaveModal(false)}
          onCreated={() => {
            setShowSaveModal(false)
            addToast('Saved to Cubes & Decks', 'info')
          }}
          addToast={addToast}
        />
      )}
    </>
  )
}
