import { defineConfig, devices } from '@playwright/test';

// Runs against the published static site (.artifacts/web/wwwroot), served by a plain file server: the M2 gate that
// `dotnet publish src/Folio.Web` produces a site that runs without any backend.
// FOLIO_E2E_BROWSERS limits engines (comma separated); FOLIO_CHROMIUM_PATH reuses a preinstalled Chromium.
const wanted = (process.env.FOLIO_E2E_BROWSERS || 'chromium,firefox,webkit').split(',');
const chromiumLaunch = process.env.FOLIO_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.FOLIO_CHROMIUM_PATH } } : {};
// Chromium runs every spec. Firefox and WebKit run the cross-engine spec: Playwright's builds of them lack the OPFS
// sync access handles SQLite needs, so the full suite cannot start a library there (DECISIONS D-021).
const crossEngine = /browsers\.spec\.mjs$/;
const projects = [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...chromiumLaunch } },
    // Playwright's Firefox may ship with the Origin Private File System off; the app needs it (DECISIONS D-021).
    { name: 'firefox', testMatch: crossEngine, use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'dom.fs.enabled': true, 'dom.fs.writable_file_stream.enabled': true } } } },
    { name: 'webkit', testMatch: crossEngine, use: { ...devices['Desktop Safari'] } },
].filter(p => wanted.includes(p.name));

export default defineConfig({
    testDir: './specs',
    timeout: 180_000,
    expect: { timeout: 30_000 },
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['json', { outputFile: '../../.artifacts/web-e2e/results.json' }]],
    outputDir: '../../.artifacts/web-e2e/output',
    use: { baseURL: 'http://127.0.0.1:5080', trace: 'off', screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 } },
    projects,
    webServer: {
        command: 'node serve.mjs ../../.artifacts/web/wwwroot 5080',
        url: 'http://127.0.0.1:5080/index.html',
        reuseExistingServer: !process.env.CI,
    },
});
