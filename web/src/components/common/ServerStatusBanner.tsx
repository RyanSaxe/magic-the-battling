import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { ServerStatusWindow } from './ServerStatusWindow'
import { useServerStatus } from '../../hooks/useServerStatus'

export function ServerStatusBanner() {
  const location = useLocation()
  const status = useServerStatus()
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)

  if (!status || status.mode === 'normal') return null
  if (/^\/game\/[^/]+\/play$/.test(location.pathname)) return null

  const hidden = dismissedAt === status.updated_at

  return (
    <ServerStatusWindow
      status={status}
      hidden={hidden}
      onDismiss={() => setDismissedAt(status.updated_at)}
      inGame={false}
    />
  )
}
