import { SCRYFALL_SYMBOLS } from '../../constants/assets'

interface ManaSymbolProps {
  symbol: keyof typeof SCRYFALL_SYMBOLS
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 16,
  md: 24,
  lg: 32,
}

export function ManaSymbol({ symbol, size = 'md', className = '' }: ManaSymbolProps) {
  const px = sizes[size]
  return (
    <img
      src={SCRYFALL_SYMBOLS[symbol]}
      alt={symbol}
      width={px}
      height={px}
      className={className}
    />
  )
}
