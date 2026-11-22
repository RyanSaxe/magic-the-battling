import type { SpectateRequest } from '../hooks/useWebSocket'
import { DIALOG_BACKDROP } from './common/styles'

export function SpectateRequestModal({
  request,
  onRespond,
}: {
  request: SpectateRequest
  onRespond: (requestId: string, allowed: boolean) => void
}) {
  // A spectator is waiting on this answer, so it sits above the guide and any menu or card preview.
  return (
    <div className={`fixed inset-0 ${DIALOG_BACKDROP} flex items-center justify-center z-[102]`}>
      <div className="modal-chrome border gold-border rounded-lg p-6 w-full max-w-sm mx-4">
        <h2 className="text-xl text-white mb-4">Spectate Request</h2>
        <p className="text-[var(--ivory-muted)] mb-6">
          <strong>{request.spectator_name}</strong> wants to watch your game.
        </p>
        <div className="flex gap-3">
          <button
            className="btn btn-primary flex-1"
            onClick={() => onRespond(request.request_id, true)}
          >
            Allow
          </button>
          <button
            className="btn btn-secondary flex-1"
            onClick={() => onRespond(request.request_id, false)}
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  )
}
