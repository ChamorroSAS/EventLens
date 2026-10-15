import { defineConfig, devices } from '@playwright/test';

const webPort = process.env.WEB_PORT || '4201';
const webBaseUrl = process.env.WEB_BASE_URL || `http://127.0.0.1:${webPort}`;
// If WEB_BASE_URL is explicitly set to port 4200 (Angular dev server), reuse existing server
const isDevServer = process.env.WEB_BASE_URL?.includes(':4200') ?? false;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: { baseURL: webBaseUrl, trace: 'retain-on-failure' },
  webServer: isDevServer ? undefined : {
    command: 'node ../apps/web/spa-server.mjs',
    url: webBaseUrl,
    reuseExistingServer: false,
    env: {
      SPA_PORT: webPort,
      SPA_HOST: '127.0.0.1',
      API_PROXY_TARGET: process.env.API_BASE_URL || 'http://127.0.0.1:3000'
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }
  ],
});
