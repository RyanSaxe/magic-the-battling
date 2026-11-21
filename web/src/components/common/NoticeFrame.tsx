import type { ReactNode } from 'react'
import { AppHeader, HomeButton } from './AppHeader'
import { PageFrame } from './PageFrame'

/** The page frame for a screen that explains why a page can't be shown, with a Home button in its header. */
export function NoticeFrame({ children, onHome }: { children: ReactNode; onHome?: () => void }) {
  return (
    <PageFrame header={<AppHeader home={<HomeButton onHome={onHome} />} />} center contentClassName="items-center">
      {children}
    </PageFrame>
  )
}
