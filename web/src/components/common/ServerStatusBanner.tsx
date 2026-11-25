import { Suspense, lazy, useState, type ReactElement } from "react";
import { useLocation } from "react-router-dom";

import { useServerStatus } from "../../hooks/useServerStatus";

const ServerStatusWindow = lazy(async () => ({
  default: (await import("./ServerStatusWindow")).ServerStatusWindow,
}));

export function ServerStatusBanner(): ReactElement | null {
  const location = useLocation();
  const status = useServerStatus();
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  if (!status || status.mode === "normal") return null;
  if (/^\/game\/[^/]+\/play$/.test(location.pathname)) return null;

  const hidden = dismissedAt === status.updated_at;

  return (
    <Suspense fallback={null}>
      <ServerStatusWindow
        status={status}
        hidden={hidden}
        onDismiss={() => setDismissedAt(status.updated_at)}
        inGame={false}
      />
    </Suspense>
  );
}
