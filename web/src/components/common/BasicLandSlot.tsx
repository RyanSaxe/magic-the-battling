import { useState, useRef, useEffect } from 'react'
import { BasicLandCard } from './BasicLandCard'
import { CardSlot } from './CardSlot'
import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'

interface BasicLandSlotProps {
  selected: string | null
  dimensions: { width: number; height: number }
  onPick: (name: string) => void
  isMobile?: boolean
}

export function BasicLandSlot({ selected, dimensions, onPick, isMobile = false }: BasicLandSlotProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const emptyLabel = isMobile ? 'Tap to pick' : 'Click to pick'

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {selected ? (
          <BasicLandCard name={selected} dimensions={dimensions} />
        ) : (
          <CardSlot label={emptyLabel} dimensions={dimensions} />
        )}
      </div>
      {open && (
        <div className="absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 bg-gray-900 border border-gray-600 rounded-lg p-2 shadow-xl">
          <div className="grid grid-cols-3 gap-1.5">
            {BASIC_LANDS.map(({ name }) => (
              <button
                key={name}
                onClick={() => { onPick(name); setOpen(false) }}
                className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-gray-700/50"
              >
                <img
                  src={BASIC_LAND_IMAGES[name]}
                  alt={name}
                  className="w-10 h-14 rounded object-cover"
                />
                <span className="text-[9px] text-gray-400">{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
