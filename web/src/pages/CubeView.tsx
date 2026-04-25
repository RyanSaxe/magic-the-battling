import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { FaDiscord } from 'react-icons/fa6'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { CubeCobraPrimerLink } from '../components/common/CubeCobraPrimerLink'
import { CubeGameHistory } from '../components/CubeGameHistory'
import { getCubeGames } from '../api/client'

export function CubeView() {
  const { cubeId } = useParams<{ cubeId: string }>()
  const navigate = useNavigate()
  const [cubeName, setCubeName] = useState<string | null>(null)
  const [cubeImageUri, setCubeImageUri] = useState<string | null>(null)

  const fetchGames = useCallback(async (_id: string, opts: { offset?: number; playMode?: string; useUpgrades?: boolean }) => {
    return getCubeGames(_id, opts)
  }, [])

  const cubeCobraUrl = cubeId
    ? `https://cubecobra.com/cube/overview/${encodeURIComponent(cubeId)}`
    : '#'

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <AppHeader renderRight={({ compact }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
          >
            Back
          </button>
          <UserMenuButton compact={compact} />
        </div>
      )} />

      <div className="flex-1 flex min-h-0 game-surface">
        <div className="sm:hidden w-[4px] shrink-0 frame-chrome" />

        <main className="flex-1 min-w-0 min-h-0 p-[2px] zone-divider-bg flex flex-col">
          <div className="zone-pack shell-scroll-col flex-1 min-w-0 min-h-0 flex flex-col px-4 py-4 overflow-auto">
            {cubeId && (
              <CubeGameHistory
                cubeId={cubeId}
                cubeName={cubeName}
                cubeImageUri={cubeImageUri}
                cubeCobraUrl={cubeCobraUrl}
                defaultPlayMode={null}
                defaultUpgrades={null}
                loadGames={fetchGames}
                onMetadata={(name, uri) => { setCubeName(name); setCubeImageUri(uri) }}
                actions={
                  <button
                    onClick={() => navigate(`/play?cubeId=${encodeURIComponent(cubeId)}`)}
                    className="btn btn-primary py-1.5 px-3 text-sm font-semibold"
                  >
                    Play
                  </button>
                }
              />
            )}
          </div>
        </main>

        <div className="w-[4px] sm:w-10 shrink-0 frame-chrome" />
      </div>

      <footer className="shrink-0 frame-chrome bar-pad-both py-2">
        <div className="flex items-center justify-between">
          <a href="https://discord.gg/2NAjcWXNKn" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors">
            <FaDiscord className="w-4 h-4" />
            Join Discord
          </a>
          <CubeCobraPrimerLink />
        </div>
      </footer>
    </div>
  )
}
