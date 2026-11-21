import { defineConfig, devices } from '@playwright/test'

const port = 4317

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
  },
  projects: [
    { name: 'iPhone SE', testIgnore: ['game-layout.spec.ts', 'phase-actions.spec.ts'], use: { ...devices['iPhone SE'] } },
    {
      name: 'iPhone 15, short viewport',
      testIgnore: ['game-layout.spec.ts', 'phase-actions.spec.ts'],
      use: { ...devices['iPhone 15'], viewport: { width: 393, height: 560 } },
    },
    { name: 'iPhone 15 landscape', testIgnore: ['game-layout.spec.ts', 'phase-actions.spec.ts'], use: { ...devices['iPhone 15 landscape'] } },
    // Each screen in the game layout spec sets its own viewport, so it runs once.
    { name: 'game layout', testMatch: 'game-layout.spec.ts', use: { ...devices['Desktop Safari'] } },
    { name: 'phase actions', testMatch: 'phase-actions.spec.ts', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // A server already on this port may be another checkout's build, so never test against it.
    reuseExistingServer: false,
  },
})
