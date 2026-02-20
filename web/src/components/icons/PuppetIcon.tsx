interface PuppetIconProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function PuppetIcon({ size = 'md', className = '' }: PuppetIconProps) {
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
      <rect x="4" y="0.5" width="16" height="2.5" rx="1.25" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.2" />
      <line x1="7" y1="3" x2="7" y2="12.5" stroke="#0891B2" strokeWidth="1" opacity="0.5" />
      <line x1="12" y1="3" x2="12" y2="5.5" stroke="#0891B2" strokeWidth="1" opacity="0.5" />
      <line x1="17" y1="3" x2="17" y2="12.5" stroke="#0891B2" strokeWidth="1" opacity="0.5" />
      <circle cx="12" cy="7.5" r="2" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.5" />
      <rect x="10" y="9.5" width="4" height="5" rx="1.5" fill="#22D3EE" stroke="#0891B2" strokeWidth="1.5" />
      <line x1="10" y1="11" x2="7" y2="13" stroke="#0891B2" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="11" x2="17" y2="13" stroke="#0891B2" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="7" cy="13" r="1.3" fill="#22D3EE" stroke="#0891B2" strokeWidth="1" />
      <circle cx="17" cy="13" r="1.3" fill="#22D3EE" stroke="#0891B2" strokeWidth="1" />
      <line x1="11" y1="14.5" x2="9" y2="20.5" stroke="#0891B2" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="14.5" x2="15" y2="20.5" stroke="#0891B2" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="20.5" r="1.3" fill="#22D3EE" stroke="#0891B2" strokeWidth="1" />
      <circle cx="15" cy="20.5" r="1.3" fill="#22D3EE" stroke="#0891B2" strokeWidth="1" />
    </svg>
  )
}
