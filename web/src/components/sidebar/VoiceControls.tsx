import type { VoiceChatState } from "../../hooks/useVoiceChat";

interface VoiceControlsProps {
  state: VoiceChatState;
  onToggleMute: () => void;
}

const CONNECTION_COLORS: Record<VoiceChatState['connectionState'], string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500',
  failed: 'bg-red-500',
  disconnected: '',
};

export function VoiceControls({ state, onToggleMute }: VoiceControlsProps) {
  if (!state.isAvailable && state.connectionState === 'disconnected') {
    return (
      <div className="flex items-center justify-center gap-1.5 text-[10px] text-red-400/80">
        <MicOffIcon className="w-3 h-3" />
        <span>Mic blocked</span>
      </div>
    );
  }

  if (state.connectionState === 'disconnected') return null;

  const dotColor = CONNECTION_COLORS[state.connectionState];

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={onToggleMute}
        className={`flex items-center gap-1.5 px-2 py-1 text-[10px] rounded transition-colors ${
          state.isMuted
            ? 'bg-red-600/40 text-red-300 hover:bg-red-600/60'
            : 'bg-indigo-600/40 text-indigo-200 hover:bg-indigo-600/60'
        }`}
      >
        {state.isMuted ? <MicOffIcon className="w-3 h-3" /> : <MicIcon className="w-3 h-3" />}
        {state.isMuted ? 'Muted' : 'Mic on'}
      </button>
      {dotColor && (
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      )}
    </div>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function MicOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
      <path d="M5 10v2a7 7 0 0 0 12 5" />
      <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
