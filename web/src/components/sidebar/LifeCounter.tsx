import { useState } from 'react'

interface LifeCounterProps {
  label: string
  initialLife?: number
}

export function LifeCounter({ label, initialLife = 20 }: LifeCounterProps) {
  const [life, setLife] = useState(initialLife)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(initialLife))

  const handleIncrement = (amount: number) => {
    setLife((prev) => prev + amount)
  }

  const handleClick = () => {
    setEditValue(String(life))
    setIsEditing(true)
  }

  const handleSubmit = () => {
    const parsed = parseInt(editValue, 10)
    if (!isNaN(parsed)) {
      setLife(parsed)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
    }
  }

  return (
    <div className="bg-black/30 rounded-lg p-3">
      <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
        {label}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => handleIncrement(-1)}
          className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold"
        >
          -
        </button>
        {isEditing ? (
          <input
            type="number"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-16 text-center text-2xl font-bold bg-gray-800 text-white rounded border border-amber-500 focus:outline-none"
          />
        ) : (
          <button
            onClick={handleClick}
            className="text-2xl font-bold text-white hover:text-amber-400 transition-colors cursor-pointer"
          >
            {life}
          </button>
        )}
        <button
          onClick={() => handleIncrement(1)}
          className="w-8 h-8 rounded bg-gray-700 hover:bg-gray-600 text-white text-lg font-bold"
        >
          +
        </button>
      </div>
    </div>
  )
}
