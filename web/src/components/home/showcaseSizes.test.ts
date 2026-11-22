import { expect, it } from 'vitest'
import { computeShowcaseSizes } from './showcaseSizes'

it('shrinks cards when container height shrinks for the Resume shelf so the showcase never scrolls', () => {
  const withoutShelf = computeShowcaseSizes(1000, 420, 1024, 80)
  const withShelf = computeShowcaseSizes(1000, 360, 1024, 80)
  expect(withShelf.hand.height).toBeLessThan(withoutShelf.hand.height)
  expect(withShelf.hand.height + withShelf.field.height + 80).toBeLessThanOrEqual(360)
})

it('fits 375x548 phone free space without overflowing width or height', () => {
  const containerW = 335
  const containerH = 330
  const chrome = 80
  const sizes = computeShowcaseSizes(containerW, containerH, 375, chrome)
  const fiveCardWidth = sizes.hand.width * 5 + sizes.handGap * 4
  expect(fiveCardWidth).toBeLessThanOrEqual(containerW)
  expect(sizes.hand.height + sizes.field.height + chrome).toBeLessThanOrEqual(containerH)
})
