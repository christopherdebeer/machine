import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for E2E Mermaid Rendering Tests
 *
 * See https://playwright.dev/docs/test-configuration
 *
 * This configuration is optimized for both local development and serverless CI
 * environments (GitHub Actions and Vercel).
 */
export default defineConfig({
    testDir: './test/e2e',

    /* Maximum time one test can run for */
    timeout: 60 * 1000, // 60 seconds per test

    /* Test timeout for expect() assertions */
    expect: {
        timeout: 10 * 1000 // 10 seconds for assertions
    },

    /* Run tests in files in parallel */
    fullyParallel: true,

    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,

    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,

    /* Opt out of parallel tests on CI for stability */
    workers: process.env.CI ? 1 : undefined,

    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: [
        ['html', { outputFolder: 'test-output/playwright-report' }],
        ['list']
    ],

    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        // baseURL: 'http://127.0.0.1:3000',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',

        /* Screenshot on failure for debugging */
        screenshot: 'only-on-failure',

        /* Video on failure for debugging */
        video: 'retain-on-failure',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Use headless mode in CI for better performance
                headless: process.env.CI ? true : false,
                // Increase viewport for better rendering
                viewport: { width: 1280, height: 720 },
            },
        },
    ],

    /* Run local dev server before starting the tests (optional) */
    // webServer: {
    //     command: 'npm run dev',
    //     url: 'http://127.0.0.1:5173',
    //     reuseExistingServer: !process.env.CI,
    //     timeout: 120 * 1000, // 2 minutes to start
    // },
});
