import { useNavigate } from 'react-router-dom'
import { RulesPanelContent } from '../components/RulesPanel'

export function Rules() {
  const navigate = useNavigate()

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Rules & Help</h1>
          <button
            onClick={() => navigate('/')}
            className="btn btn-secondary text-sm"
          >
            Home
          </button>
        </div>
      </header>
      <RulesPanelContent />
    </div>
  )
}
