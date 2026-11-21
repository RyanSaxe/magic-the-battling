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
    { name: 'iPhone SE', use: { ...devices['iPhone SE'] } },
    {
      name: 'iPhone 15, short viewport',
      use: { ...devices['iPhone 15'], viewport: { width: 393, height: 560 } },
    },
    { name: 'iPhone 15 landscape', use: { ...devices['iPhone 15 landscape'] } },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // A server already on this port may be another checkout's build, so never test against it.
    reuseExistingServer: false,
  },
})
