import { DOCS } from '../docs'
import { DocRenderer } from './DocRenderer'
import { PHASE_HOTKEYS } from '../constants/hotkeys'
import { HotkeyRow } from './HotkeyRow'

export function ControlsTab({ phase }: { phase: string }) {
  const doc = DOCS.find((d) => d.parsed.meta.phase === phase)
  const controlsMarkdown = doc?.parsed.sections['controls']
  const hotkeys = PHASE_HOTKEYS[phase] ?? []
  const hoverHotkeys = PHASE_HOTKEYS[`${phase}-hover`] ?? []

  return (
    <div className="space-y-4">
      {controlsMarkdown && <DocRenderer content={controlsMarkdown} />}

      {hotkeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Keyboard Shortcuts
          </h3>
          <div className="space-y-1.5">
            {hotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {hoverHotkeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            When Hovering a Card
          </h3>
          <div className="space-y-1.5">
            {hoverHotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
