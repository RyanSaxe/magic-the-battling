const LARGEST_FONT = 12
const SMALLEST_FONT = 7
const NUMBER_FONT = 9
const LINE_HEIGHT = 1.3
const LINE_GAP = 1
const NARROW_CARD = 56

interface FittedCounter {
  type: string
  text: string
  fontSize: number
  paddingInline: number
}

function isPowerToughness(type: string) {
  return type === '+1/+1' || type === '-1/-1'
}

export function formatCounter(type: string, count: number): string {
  if (type === '+1/+1') return `+${count}/+${count}`
  if (type === '-1/-1') return `−${count}/−${count}`
  return `${count} ${type}`
}

let canvasContext: CanvasRenderingContext2D | undefined

function measureText(text: string, fontSize: number): number {
  canvasContext ??= document.createElement('canvas').getContext('2d')!
  canvasContext.font = `600 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`
  return canvasContext.measureText(text).width
}

/** Each counter whole inside its card: as large as fits, with a name too long for the card left to the zoom. */
export function fitCounters(counters: Record<string, number>, width: number, height: number): FittedCounter[] {
  const entries = Object.entries(counters)
  const paddingInline = width < NARROW_CARD ? 1 : 4
  const room = width - 2 * paddingInline - 1
  const tallest = (height / entries.length - LINE_GAP) / LINE_HEIGHT
  const largest = Math.min(LARGEST_FONT, Math.max(SMALLEST_FONT + 1, Math.round(width * 0.18)), tallest)

  return entries.map(([type, count]) => {
    const label = formatCounter(type, count)
    for (let fontSize = largest; fontSize >= SMALLEST_FONT; fontSize -= 0.5) {
      if (measureText(label, fontSize) <= room) return { type, text: label, fontSize, paddingInline }
    }
    // Power and toughness mean nothing as a lone number, so they shrink instead.
    const text = isPowerToughness(type) ? label : String(count)
    const size = Math.min(isPowerToughness(type) ? SMALLEST_FONT : NUMBER_FONT, largest)
    const fontSize = Math.min(size, (size * room) / measureText(text, size))
    return { type, text, fontSize, paddingInline }
  })
}
