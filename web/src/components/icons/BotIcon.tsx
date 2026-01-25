interface BotIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function BotIcon({ size = 'md', className = '' }: BotIconProps) {
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
      <rect x="4" y="8" width="16" height="12" rx="2" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.5" />
      <circle cx="12" cy="5" r="2" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.5" />
      <line x1="12" y1="7" x2="12" y2="8" stroke="#0891B2" strokeWidth="1.5" />
      <circle cx="9" cy="13" r="1.5" fill="#1F2937" />
      <circle cx="15" cy="13" r="1.5" fill="#1F2937" />
      <rect x="8" y="16" width="8" height="2" rx="1" fill="#1F2937" />
    </svg>
  )
}
