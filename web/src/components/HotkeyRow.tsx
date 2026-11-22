import type { HotkeyEntry } from '../constants/hotkeys'

export function HotkeyRow({ entry, indent }: { entry: HotkeyEntry; indent?: boolean }) {
  return (
    <>
      <div className={`flex items-center gap-3 ${indent ? 'pl-6' : ''}`}>
        <kbd className="bg-[var(--chrome)] text-[var(--ivory)] font-mono text-xs px-2.5 py-1 rounded border border-[var(--stone-light)]/60 min-w-[2rem] text-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.3)]">
          {indent ? `→ ${entry.key}` : entry.key}
        </kbd>
        <span className="text-sm text-[var(--ivory-muted)]">{entry.description}</span>
      </div>
      {entry.subActions?.map((sub) => (
        <div key={sub.key} className="flex items-center gap-3 pl-6">
          <kbd className="bg-[var(--chrome)] text-[var(--ivory)] font-mono text-xs px-2.5 py-1 rounded border border-[var(--stone-light)]/60 min-w-[2rem] text-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_1px_2px_rgba(0,0,0,0.3)]">
            → {sub.key}
          </kbd>
          <span className="text-sm text-[var(--ivory-muted)]">{sub.description}</span>
        </div>
      ))}
    </>
  )
}
