interface HourglassIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function HourglassIcon({ size = 'md', className = '' }: HourglassIconProps) {
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
        d="M6 2H18V6C18 8.5 15.5 11 12 12C15.5 13 18 15.5 18 18V22H6V18C6 15.5 8.5 13 12 12C8.5 11 6 8.5 6 6V2Z"
        fill="#FBBF24"
        stroke="#D97706"
        strokeWidth="1.5"
      />
      <rect x="5" y="2" width="14" height="2" rx="0.5" fill="#D97706" />
      <rect x="5" y="20" width="14" height="2" rx="0.5" fill="#D97706" />
      <path
        d="M9 5H15L12 8L9 5Z"
        fill="#1F2937"
      />
    </svg>
  )
}
