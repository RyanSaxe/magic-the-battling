interface MoneyBagIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function MoneyBagIcon({ size = 'md', className = '' }: MoneyBagIconProps) {
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
      {/* Bag tie/knot */}
      <path
        d="M9 6C9 6 10 4 12 4C14 4 15 6 15 6"
        stroke="#D97706"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Bag body */}
      <path
        d="M7 8C6 10 5 13 5 16C5 19 8 21 12 21C16 21 19 19 19 16C19 13 18 10 17 8H7Z"
        fill="#F59E0B"
        stroke="#D97706"
        strokeWidth="1.5"
      />
      {/* Dollar sign */}
      <path
        d="M12 11V18M10 13C10 12 11 11.5 12 11.5C13 11.5 14 12 14 13C14 14 13 14.5 12 14.5C11 14.5 10 15 10 16C10 17 11 17.5 12 17.5C13 17.5 14 17 14 16"
        stroke="#92400E"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Highlight */}
      <circle cx="8" cy="13" r="1" fill="#FCD34D" />
    </svg>
  )
}
