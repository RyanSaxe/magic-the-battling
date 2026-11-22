import { Dialog } from '../common/Dialog'

export function RemovePlayerDialog({ name, onKeep, onRemove }: {
  name: string
  onKeep: () => void
  onRemove: () => void
}) {
  return (
    <Dialog title={`Remove ${name}?`} onClose={onKeep}>
      <p className="text-sm leading-relaxed text-[var(--ivory-muted)]">
        {name} loses their seat, and can join again with the code.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onKeep} className="btn btn-secondary px-2! whitespace-nowrap">
          Keep
        </button>
        <button type="button" onClick={onRemove} className="btn btn-secondary btn-destructive px-2! whitespace-nowrap">
          Remove
        </button>
      </div>
    </Dialog>
  )
}
