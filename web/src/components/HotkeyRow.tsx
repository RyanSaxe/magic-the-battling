import type { HotkeyEntry } from '../constants/hotkeys'

export function HotkeyRow({ entry, indent }: { entry: HotkeyEntry; indent?: boolean }) {
  return (
    <>
      <div className={`flex items-center gap-3 ${indent ? 'pl-6' : ''}`}>
        <kbd className="bg-gray-700 text-gray-200 font-mono text-xs px-2 py-0.5 rounded border border-gray-600 min-w-[2rem] text-center shrink-0">
          {indent ? `→ ${entry.key}` : entry.key}
        </kbd>
        <span className="text-sm text-gray-300">{entry.description}</span>
      </div>
      {entry.subActions?.map((sub) => (
        <div key={sub.key} className="flex items-center gap-3 pl-6">
          <kbd className="bg-gray-700 text-gray-200 font-mono text-xs px-2 py-0.5 rounded border border-gray-600 min-w-[2rem] text-center shrink-0">
            → {sub.key}
          </kbd>
          <span className="text-sm text-gray-400">{sub.description}</span>
        </div>
      ))}
    </>
  )
}
