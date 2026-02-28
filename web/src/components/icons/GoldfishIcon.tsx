interface GoldfishIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function GoldfishIcon({ size = 'md', className = '' }: GoldfishIconProps) {
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
      <ellipse cx="11" cy="12" rx="7" ry="5" fill="#D4AF37" opacity="0.85" />
      <path d="M18 12 L22 8 L22 16 Z" fill="#D4AF37" opacity="0.7" />
      <circle cx="7.5" cy="10.5" r="1" fill="black" opacity="0.6" />
      <path d="M11 7.5 Q13 5.5 15 7" stroke="#D4AF37" strokeWidth="1.2" fill="none" opacity="0.5" />
      <path d="M11 16.5 Q13 18.5 15 17" stroke="#D4AF37" strokeWidth="1" fill="none" opacity="0.4" />
    </svg>
  )
}
