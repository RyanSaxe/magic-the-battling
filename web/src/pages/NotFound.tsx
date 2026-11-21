import { useNavigate } from 'react-router-dom'
import { AppHeader } from '../components/common/AppHeader'
import { PageFrame } from '../components/common/PageFrame'
import { StatusNotice } from '../components/common/StatusNotice'

export function NotFound() {
  const navigate = useNavigate()
  const header = (
    <AppHeader
      renderRight={({ compact }) => (
        <button
          onClick={() => navigate('/')}
          className={`btn btn-secondary ${compact ? 'py-1.5 px-3 text-sm' : 'py-2 px-4'}`}
        >
          Home
        </button>
      )}
    />
  )
  return (
    <PageFrame header={header} center="except-short-wide" contentClassName="items-center px-4">
      <StatusNotice
        title="Page not found"
        actions={
          <>
            <button onClick={() => navigate('/')} className="btn btn-primary flex-1 py-2">
              Home
            </button>
            <button onClick={() => navigate('/play')} className="btn btn-secondary flex-1 py-2">
              Play
            </button>
          </>
        }
      >
        There&apos;s nothing at this address. It may have been mistyped or moved.
      </StatusNotice>
    </PageFrame>
  )
}
