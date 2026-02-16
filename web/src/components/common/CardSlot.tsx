interface CardSlotProps {
  label: string
  dimensions: { width: number; height: number }
}

export function CardSlot({ label, dimensions }: CardSlotProps) {
  return (
    <div
      className="flex items-center justify-center rounded border-2 border-dashed border-gray-600/60 bg-black/20"
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      <span className="text-[9px] text-gray-500 text-center leading-tight px-1">
        {label}
      </span>
    </div>
  )
}
