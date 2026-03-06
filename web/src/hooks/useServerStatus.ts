import { useCallback, useEffect, useState } from 'react'

import { getServerStatus } from '../api/client'
import type { ServerStatus } from '../types'

const STATUS_POLL_INTERVAL_MS = 15_000

export function useServerStatus() {
  const [status, setStatus] = useState<ServerStatus | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await getServerStatus()
      setStatus(next)
    } catch {
      // Keep the last known status when fetches fail.
    }
  }, [])

  useEffect(() => {
    const immediate = window.setTimeout(() => {
      void refresh()
    }, 0)
    const interval = window.setInterval(() => {
      void refresh()
    }, STATUS_POLL_INTERVAL_MS)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearTimeout(immediate)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])

  return status
}
