import type { ReactNode } from 'react'
import { AppHeader, HomeButton } from './AppHeader'
import { PageFrame } from './PageFrame'

/**
 * The page frame for a screen that explains why a page can't be shown, with a Home button in its header.
 * Pass `home={null}` outside the router, where the Home button can't navigate.
 */
export function NoticeFrame({ children, home = <HomeButton /> }: { children: ReactNode; home?: ReactNode }) {
  return (
    <PageFrame header={<AppHeader home={home} />} center contentClassName="items-center">
      {children}
    </PageFrame>
  )
}
