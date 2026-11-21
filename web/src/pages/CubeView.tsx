import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AppHeader, UserMenuButton } from '../components/common/AppHeader'
import { PageFrame } from '../components/common/PageFrame'
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
    <PageFrame
      header={<AppHeader renderRight={({ compact }) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
          >
            Back
          </button>
          <UserMenuButton compact={compact} />
        </div>
      )} />}
      contentClassName="px-4 py-4"
    >
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
    </PageFrame>
  )
}
