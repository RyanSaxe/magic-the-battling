interface PoisonIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function PoisonIcon({ size = 'md', className = '' }: PoisonIconProps) {
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
        d="M12 2C12 2 8 6 8 10C8 12.21 9.79 14 12 14C14.21 14 16 12.21 16 10C16 6 12 2 12 2Z"
        fill="#A855F7"
        stroke="#6B21A8"
        strokeWidth="1.5"
      />
      <path
        d="M12 14V22"
        stroke="#6B21A8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 18H16"
        stroke="#6B21A8"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="10" cy="8" r="1" fill="#E9D5FF" />
      <circle cx="14" cy="10" r="0.75" fill="#E9D5FF" />
    </svg>
  )
}
