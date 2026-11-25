import type { ReactElement, ReactNode } from "react";
import { PageFrame } from "../common/PageFrame";
import { HomeHeader } from "./HomeHeader";

/** The frame and centred column that the dashboard and the pages it opens share. */
export function DashboardFrame({
  header,
  children,
}: {
  header?: ReactNode;
  children: ReactNode;
}): ReactElement {
  return (
    <PageFrame header={header === undefined ? <HomeHeader /> : header}>
      <div className="mx-auto flex w-full max-w-[1080px] min-[1600px]:max-w-[1400px] flex-col gap-3">
        {children}
      </div>
    </PageFrame>
  );
}
