import { useLocation } from 'react-router-dom'

import { useServerStatus } from '../../hooks/useServerStatus'

function formatLocalTime(isoUtc: string): string | null {
  const date = new Date(isoUtc)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

export function ServerStatusBanner() {
  const location = useLocation()
  const status = useServerStatus()

  if (!status || status.mode === 'normal') return null
  if (/^\/game\/[^/]+\/play$/.test(location.pathname)) return null

  const isDraining = status.mode === 'draining'
  const localScheduled = status.scheduled_for_utc ? formatLocalTime(status.scheduled_for_utc) : null
  const heading = isDraining ? 'Scheduled Server Update' : 'Server Maintenance'
  const fallbackMessage = isDraining
    ? 'A server update is scheduled soon. New games are paused while current games continue.'
    : 'The server is currently updating. Please wait a few minutes and retry.'
  const recoveryHint = status.estimated_recovery_minutes
    ? `Estimated recovery: about ${status.estimated_recovery_minutes} minute${status.estimated_recovery_minutes === 1 ? '' : 's'}.`
    : null

  return (
    <div className="fixed top-0 inset-x-0 z-50 px-3 pt-3 pointer-events-none">
      <div
        className={`mx-auto max-w-4xl pointer-events-auto rounded-lg shadow-xl px-4 py-3 border ${
          isDraining
            ? 'bg-amber-950/95 border-amber-500/40 text-amber-100'
            : 'bg-gray-950/95 border-amber-500/40 text-gray-100'
        }`}
      >
        <div className="text-sm font-semibold mb-1">{heading}</div>
        <p className="text-sm">{status.message || fallbackMessage}</p>
        {localScheduled && isDraining && (
          <p className="text-xs mt-1 opacity-90">
            Scheduled start (local): {localScheduled}
          </p>
        )}
        {recoveryHint && (
          <p className="text-xs mt-1 opacity-90">{recoveryHint}</p>
        )}
      </div>
    </div>
  )
}
