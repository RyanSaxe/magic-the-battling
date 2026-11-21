import type { ReactNode } from 'react'
import { SurfaceCard } from './SurfaceCard'

/** A titled message with its actions, for screens that explain why a lobby or game can't be shown. */
export function StatusNotice({
  title,
  children,
  actions,
}: {
  title: string
  children: ReactNode
  actions: ReactNode
}) {
  return (
    <SurfaceCard>
      <h2 className="text-lg font-semibold text-amber-200">{title}</h2>
      <div className="text-sm text-[var(--ivory)] mt-2 leading-snug">{children}</div>
      <div className="mt-4 flex flex-wrap gap-2">{actions}</div>
    </SurfaceCard>
  )
}

export function BusyNotice({ label }: { label: string }) {
  return (
    <div className="modal-chrome border gold-border rounded-lg px-5 py-3 flex items-center gap-3">
      <svg className="animate-spin h-4 w-4 text-amber-400 shrink-0" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="text-sm text-[var(--ivory)]">{label}</span>
    </div>
  )
}
