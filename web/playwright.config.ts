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
    { name: 'iPhone SE', testIgnore: ['game-layout.spec.ts', 'frame-bar.spec.ts', 'phase-actions.spec.ts', 'side-panels.spec.ts'], use: { ...devices['iPhone SE'] } },
    {
      name: 'iPhone 15, short viewport',
      testIgnore: ['game-layout.spec.ts', 'frame-bar.spec.ts', 'phase-actions.spec.ts', 'side-panels.spec.ts'],
      use: { ...devices['iPhone 15'], viewport: { width: 393, height: 560 } },
    },
    { name: 'iPhone 15 landscape', testIgnore: ['game-layout.spec.ts', 'frame-bar.spec.ts', 'phase-actions.spec.ts', 'side-panels.spec.ts'], use: { ...devices['iPhone 15 landscape'] } },
    // The game layout, frame and side panel specs set each screen's viewport themselves, so each runs once.
    {
      name: 'game layout',
      testMatch: 'game-layout.spec.ts',
      // The baseline that LAYOUT_COMPARE compares with, recorded from another build.
      snapshotPathTemplate: '{testDir}/layout-baseline/{arg}{ext}',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'frame bars',
      testMatch: 'frame-bar.spec.ts',
      // The game layout spec's divider checks reload the board many times, and run past their timeout when this spec shares the CPU with them.
      dependencies: ['game layout'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'side panels',
      testMatch: 'side-panels.spec.ts',
      dependencies: ['game layout'],
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'phase actions',
      testMatch: 'phase-actions.spec.ts',
      dependencies: ['game layout'],
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: `npx vite build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    // A server already on this port may be another checkout's build, so never test against it.
    reuseExistingServer: false,
  },
})
