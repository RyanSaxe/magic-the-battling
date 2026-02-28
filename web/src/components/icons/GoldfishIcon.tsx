export function GoldfishIcon({ className = 'w-7 h-7 text-amber-400' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="10.5" cy="12" rx="7.5" ry="7" fill="currentColor" opacity="0.85" />
      <path d="M17.5 12 L22.5 5 L21 12 L22.5 19 Z" fill="currentColor" opacity="0.7" />
      <path d="M8 5.5 C10 2.5 13 2.5 15.5 5.5" fill="currentColor" opacity="0.6" />
      <path d="M9 18.5 C10.5 21 12.5 21 14 18.5" fill="currentColor" opacity="0.5" />
      <circle cx="7" cy="10" r="1.4" fill="black" opacity="0.45" />
    </svg>
  )
}
