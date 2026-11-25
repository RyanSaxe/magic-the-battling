import type { ReactElement, ReactNode } from "react";
import { AppHeader, HomeButton } from "./AppHeader";
import { PageFrame } from "./PageFrame";

/**
 * The page frame for a screen that explains why a page can't be shown, with a Home button in its header.
 * Pass `home` to replace that button, such as a HomeButton that also cancels a request, or `null` outside the
 * router, where the Home button can't navigate.
 */
export function NoticeFrame({
  children,
  home,
}: {
  children: ReactNode;
  home?: ReactNode;
}): ReactElement {
  const resolvedHome = home === undefined ? <HomeButton /> : home;
  return (
    <PageFrame
      header={<AppHeader home={resolvedHome} />}
      center
      contentClassName="items-center"
    >
      {children}
    </PageFrame>
  );
}
