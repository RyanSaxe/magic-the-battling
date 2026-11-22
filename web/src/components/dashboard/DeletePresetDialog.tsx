import { Dialog } from '../common/Dialog'

export function DeletePresetDialog({
  title,
  imageUri,
  deleting = false,
  onKeep,
  onDelete,
}: {
  title: string
  imageUri?: string | null
  deleting?: boolean
  onKeep: () => void
  onDelete: () => void
}) {
  return (
    <Dialog title="Delete this preset?" onClose={onKeep}>
      <div className="delete-preset-row">
        <span className="delete-preset-art">
          {imageUri && <img src={imageUri} alt="" />}
        </span>
        <b>{title}</b>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--ivory-muted)]">
        Your finished games stay in Recent Games.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onKeep} disabled={deleting} className="btn btn-secondary">
          Keep
        </button>
        <button type="button" onClick={onDelete} disabled={deleting} className="btn btn-secondary btn-destructive">
          Delete
        </button>
      </div>
    </Dialog>
  )
}
