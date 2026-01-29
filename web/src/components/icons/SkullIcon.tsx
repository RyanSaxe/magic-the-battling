interface SkullIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function SkullIcon({ size = 'md', className = '' }: SkullIconProps) {
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
        d="M12 2C7 2 3 6 3 11C3 14 4.5 16.5 7 18V21C7 21.5 7.5 22 8 22H16C16.5 22 17 21.5 17 21V18C19.5 16.5 21 14 21 11C21 6 17 2 12 2Z"
        fill="#F87171"
        stroke="#DC2626"
        strokeWidth="1.5"
      />
      <circle cx="9" cy="11" r="2" fill="#1F2937" />
      <circle cx="15" cy="11" r="2" fill="#1F2937" />
      <path
        d="M10 17V19M12 17V19M14 17V19"
        stroke="#1F2937"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
