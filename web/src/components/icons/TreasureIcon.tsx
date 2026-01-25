interface TreasureIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function TreasureIcon({ size = 'md', className = '' }: TreasureIconProps) {
  const px = sizes[size]
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 2L4 7V10C4 15.55 7.16 20.74 12 22C16.84 20.74 20 15.55 20 10V7L12 2Z"
        fill="#F59E0B"
        stroke="#92400E"
        strokeWidth="1.5"
      />
      <circle cx="12" cy="12" r="4" fill="#FCD34D" />
      <path
        d="M12 9V15M9 12H15"
        stroke="#92400E"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
