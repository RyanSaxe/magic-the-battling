interface GhostIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function GhostIcon({ size = 'md', className = '' }: GhostIconProps) {
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
        d="M12 2C7.58 2 4 5.58 4 10V20C4 20 6 18 8 20C10 22 12 20 12 20C12 20 14 22 16 20C18 18 20 20 20 20V10C20 5.58 16.42 2 12 2Z"
        fill="#9CA3AF"
        stroke="#6B7280"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="10" r="2" fill="#1F2937" />
      <circle cx="15" cy="10" r="2" fill="#1F2937" />
    </svg>
  )
}
