import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppHeader } from './AppHeader'
import { PageFrame } from './PageFrame'

/** The page frame for a screen that explains why a page can't be shown, with a Home button in its header. */
export function NoticeFrame({ children }: { children: ReactNode }) {
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
    <PageFrame header={header} center contentClassName="items-center">
      {children}
    </PageFrame>
  )
}
