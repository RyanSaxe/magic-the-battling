import type { SpectateRequest } from '../hooks/useWebSocket'

export function SpectateRequestModal({
  request,
  onRespond,
}: {
  request: SpectateRequest
  onRespond: (requestId: string, allowed: boolean) => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="modal-chrome border gold-border rounded-lg p-6 w-full max-w-sm mx-4">
        <h2 className="text-xl text-white mb-4">Spectate Request</h2>
        <p className="text-gray-300 mb-6">
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
