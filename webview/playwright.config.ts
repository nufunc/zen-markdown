import { defineConfig, devices } from '@playwright/test';

// 기본 5174. Windows가 이 포트를 예약 범위로 잡은 PC에서는 사용자 환경변수 ZEN_DEV_PORT로 바꾼다.
const PORT = Number(process.env.ZEN_DEV_PORT) || 5174;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  // 성능 테스트(perf-*.spec.ts)는 다른 테스트와 CPU를 나눠 쓰면 수치가 흔들린다. 나머지가 끝난 뒤 따로 돌린다
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /perf-.*\.spec\.ts/,
    },
    {
      name: 'perf',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /perf-.*\.spec\.ts/,
      dependencies: ['chromium'],
      workers: 1,
    },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
