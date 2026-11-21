import type { ReactNode } from 'react'
import { AppHeader, HomeButton } from './AppHeader'
import { PageFrame } from './PageFrame'

/** The page frame for a screen that explains why a page can't be shown, with a Home button in its header. */
export function NoticeFrame({ children }: { children: ReactNode }) {
  return (
    <PageFrame header={<AppHeader home={<HomeButton />} />} center contentClassName="items-center">
      {children}
    </PageFrame>
  )
}
