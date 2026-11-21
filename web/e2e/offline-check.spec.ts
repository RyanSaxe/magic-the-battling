import { expect, outsideUrl, test } from './helpers'

const FAR_AWAY = { ipAddress: '151.101.1.1', port: 443 }
const THIS_MACHINE = { ipAddress: '127.0.0.1', port: 4317 }
const TEST_ENDED = () => Promise.reject(new Error('response.serverAddr: Test ended.'))

function response(url: string, serverAddr: () => Promise<{ ipAddress: string; port: number } | null>) {
  return { url: () => url, serverAddr }
}

test('a response from another server counts as reaching the network', async () => {
  expect(await outsideUrl(response('https://example.com/card.jpg', async () => FAR_AWAY))).toBe('https://example.com/card.jpg')
})

test('a response from this machine or a mock does not', async () => {
  expect(await outsideUrl(response('http://localhost:4317/api/auth/me', async () => THIS_MACHINE))).toBeNull()
  expect(await outsideUrl(response('https://fonts.gstatic.com/s/cinzel.woff2', async () => null))).toBeNull()
})

test('a response still arriving as the test ends is judged by where it was sent', async () => {
  expect(await outsideUrl(response('http://localhost:4317/assets/index.js', TEST_ENDED))).toBeNull()
  expect(await outsideUrl(response('https://cards.scryfall.io/large/front/card.jpg', TEST_ENDED))).toBeNull()
  expect(await outsideUrl(response('https://example.com/card.jpg', TEST_ENDED))).toBe('https://example.com/card.jpg')
})
