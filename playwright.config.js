import { defineConfig } from '@playwright/test';

/**
 * Persistent E2E suite. Frontend-only: `bun run build && preview`, with all
 * /api traffic mocked per-spec (route interception) — no MongoDB needed, so
 * the suite runs locally and in CI identically. Covers the highest-value
 * anonymous surfaces (gallery / display follow) and the timer control page.
 */
export default defineConfig({
    testDir: './e2e',
    // .e2e.js keeps these specs out of `bun test`'s default *.spec.js scan.
    testMatch: '**/*.e2e.js',
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    workers: process.env.CI ? 1 : undefined,
    use: {
        // Port 39173 sits above the Windows dynamic exclusion ranges
        // (Hyper-V reboots shift them; 4173/4573 both fell inside).
        baseURL: 'http://127.0.0.1:39173',
        // Keep runs hermetic: fresh storage, no service-worker state.
        contextOptions: { serviceWorkers: 'block' },
    },
    webServer: {
        command: 'bun run preview --port 39173 --strictPort --host 127.0.0.1',
        url: 'http://127.0.0.1:39173',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
    },
});
