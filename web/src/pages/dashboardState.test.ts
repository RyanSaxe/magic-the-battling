import { describe, expect, it } from 'vitest'
import { visitLoadsFirstPage } from './dashboardState'

describe('visitLoadsFirstPage', () => {
  it('loads on the first visit and on a visit after a failed load', () => {
    expect(visitLoadsFirstPage('idle')).toBe(true)
    expect(visitLoadsFirstPage('failed')).toBe(true)
  })

  it('sends no second request while the first page is loading or once it has loaded', () => {
    expect(visitLoadsFirstPage('loading')).toBe(false)
    expect(visitLoadsFirstPage('loaded')).toBe(false)
  })
})
