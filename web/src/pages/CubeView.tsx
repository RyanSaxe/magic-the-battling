import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../contexts/authState'
import { useToast } from '../contexts'
import { AddCubeModal } from '../components/dashboard/AddCubeModal'
import { DashboardFrame } from '../components/dashboard/DashboardFrame'
import { DetailHero, HeroLink, type HeroAction } from '../components/dashboard/DetailHero'
import { GameHistory, type LoadGames } from '../components/dashboard/GameHistory'
import { Breadcrumb, NoticeTile, SectionTitle } from '../components/dashboard/Section'
import { followCube, getCubeGames, getCubeSummary, unfollowCube } from '../api/client'
import { useFirstLoad } from '../hooks/useFirstLoad'
import { formatWhen, modeLabel, upgradesLabel } from '../utils/accountFormat'
import { unknownToAppError } from '../utils/appError'

const ALL_GAMES = { playMode: null, useUpgrades: null, mineOnly: false }

export function CubeView() {
  const { cubeId = '' } = useParams<{ cubeId: string }>()
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { addToast } = useToast()
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [changingFollow, setChangingFollow] = useState(false)
  // Waits for sign-in to be known, since the summary says whether this player follows the cube.
  const loadSummary = useCallback(() => getCubeSummary(cubeId), [cubeId])
  const summaryLoad = useFirstLoad(loadSummary, !authLoading)
  const summary = summaryLoad.state.status === 'loaded' ? summaryLoad.state.value : null

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
        summaryLoad.update({ status: 'loaded', value: { ...summary, is_following: false, follow_id: null } })
      } else {
        const follow = await followCube(cubeId)
        summaryLoad.update({ status: 'loaded', value: { ...summary, is_following: true, follow_id: follow.id } })
      }
    } catch (err) {
      addToast(unknownToAppError(err, 'follow-cube', 'Failed to change the follow').message, 'error')
    } finally {
      setChangingFollow(false)
    }
  }

  const title = summary?.cube_name ?? cubeId
  const setup = summary?.popular_setup
  const actions: HeroAction[] =
    user && summary
      ? [
          {
            label: summary.is_following ? '✓ Following' : 'Follow',
            onClick: toggleFollow,
            disabled: changingFollow,
            pressed: summary.is_following,
          },
          { label: 'Save', onClick: () => setShowSaveModal(true) },
        ]
      : []

  return (
    <>
      <DashboardFrame>
        {user && <Breadcrumb to="/dashboard/discover" label="Discover Cubes" current={title} />}
        <DetailHero
          imageUri={summary?.cube_image_uri}
          badge={{ label: 'Community Cube', tone: 'Cube' }}
          title={title}
          links={<>
            <span>
              CubeCobra ID: <strong className="font-semibold text-amber-50">{cubeId}</strong>
            </span>
            <HeroLink href={`https://cubecobra.com/cube/list/${encodeURIComponent(cubeId)}`}>
              View Full Card List on CubeCobra ↗
            </HeroLink>
          </>}
          actions={actions}
          play={{ label: 'Play', onClick: () => navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`) }}
          stats={[
            { label: 'Games Played', value: summary?.game_count ?? '—' },
            { label: 'Players', value: summary?.human_player_count ?? '—' },
            { label: 'Last Played', value: summary?.last_played ? formatWhen(summary.last_played) : '—' },
            { label: 'Popular Setup', value: setup ? `${modeLabel(setup.play_mode)} · ${upgradesLabel(setup.use_upgrades)}` : '—' },
          ]}
        />
        {summaryLoad.state.status === 'failed' && (
          <NoticeTile action={{ label: 'Retry', onClick: summaryLoad.retry }}>This cube&apos;s details didn&apos;t load.</NoticeTile>
        )}
        <GameHistory
          loadGames={loadGames}
          initialFilters={ALL_GAMES}
          title={(total) => (
            <SectionTitle>Community Game History{total !== null ? ` (${total})` : ''}</SectionTitle>
          )}
        />
      </DashboardFrame>

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
