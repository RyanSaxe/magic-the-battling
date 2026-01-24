import { CARD_BACK_IMAGE } from '../../constants/assets'

interface CardBackProps {
  size?: 'sm' | 'md' | 'lg'
  tapped?: boolean
  onClick?: () => void
  className?: string
}

const sizeStyles = {
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
}

export function CardBack({
  size = 'md',
  tapped = false,
  onClick,
  className = '',
}: CardBackProps) {
  const dimensions = sizeStyles[size]

  const baseClasses = [
    'card card-on-table',
    'relative rounded-lg overflow-hidden',
    onClick && 'cursor-pointer',
    tapped && 'tapped',
    className,
  ].filter(Boolean).join(' ')

  return (
    <div
      className={baseClasses}
      style={{
        width: dimensions.width,
        height: dimensions.height,
      }}
      onClick={onClick}
    >
      <img
        src={CARD_BACK_IMAGE}
        alt="Card back"
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  )
}
