import { useState } from 'react'
import { useLocation } from 'react-router-dom'

import { useServerStatus } from '../../hooks/useServerStatus'

const TOP_NOTICE_Z_INDEX = 2147483647
const SCHEDULED_UTC_IN_TEXT_RE = /scheduled for \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/i

function formatEasternTime(isoUtc: string): string | null {
  const date = new Date(isoUtc)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(date)
}

function drainingMessageWithEasternTime(message: string, easternTime: string | null): string {
  if (!message) return ''
  if (!easternTime) return message
  return message.replace(SCHEDULED_UTC_IN_TEXT_RE, `scheduled for ${easternTime}`)
}

export function ServerStatusBanner() {
  const location = useLocation()
  const status = useServerStatus()
  const [dismissedAt, setDismissedAt] = useState<string | null>(null)

  if (!status || status.mode === 'normal') return null
  if (/^\/game\/[^/]+\/play$/.test(location.pathname)) return null

  const isDraining = status.mode === 'draining'
  const hidden = dismissedAt === status.updated_at
  const easternScheduled = status.scheduled_for_utc ? formatEasternTime(status.scheduled_for_utc) : null
  const heading = isDraining ? 'Scheduled Server Update' : 'Server Maintenance'
  const fallbackMessage = isDraining
    ? 'A server update is scheduled soon. New games are paused while current games continue.'
    : 'The server is currently updating. Please wait a few minutes and retry.'
  const recoveryHint = status.estimated_recovery_minutes
    ? `Estimated recovery: about ${status.estimated_recovery_minutes} minute${status.estimated_recovery_minutes === 1 ? '' : 's'}.`
    : null
  const displayMessage = isDraining
    ? drainingMessageWithEasternTime(status.message, easternScheduled)
    : status.message

  if (hidden) {
    return (
      <div className="fixed top-3 right-3 pointer-events-none" style={{ zIndex: TOP_NOTICE_Z_INDEX }}>
        <button
          type="button"
          onClick={() => setDismissedAt(null)}
          className="pointer-events-auto modal-chrome border gold-border rounded-md px-3 py-1 text-xs text-amber-100 hover:text-white"
        >
          Show Server Notice
        </button>
      </div>
    )
  }

  return (
    <div className="fixed top-0 inset-x-0 px-3 pt-3 pointer-events-none" style={{ zIndex: TOP_NOTICE_Z_INDEX }}>
      <div className="mx-auto max-w-4xl pointer-events-auto modal-chrome border gold-border rounded-lg shadow-xl px-4 py-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex items-center justify-center rounded-full border gold-border text-amber-200 text-[10px] uppercase tracking-wide px-2 py-0.5 shrink-0">
            {isDraining ? 'Update' : 'Maintenance'}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-amber-200">{heading}</h2>
            <p className="text-sm text-gray-100 mt-1 leading-snug">{displayMessage || fallbackMessage}</p>
            {status.mode === 'draining' && (
              <p className="text-xs text-gray-300 mt-1 leading-snug">
                New games are paused temporarily. Active games may continue and reconnect automatically.
              </p>
            )}
            {recoveryHint && (
              <p className="text-xs mt-1 text-amber-200/90">{recoveryHint}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDismissedAt(status.updated_at)}
            className="text-amber-100/70 hover:text-amber-100 text-xs px-1 shrink-0"
            aria-label="Dismiss server notice"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
