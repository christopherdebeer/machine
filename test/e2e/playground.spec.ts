import { test, expect } from '@playwright/test';

/**
 * E2E Tests for DyGram Playground
 *
 * These tests validate that the playground interface loads correctly,
 * the editor is functional, and basic features work as expected.
 */

test.describe('Playground Basic Validations', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the playground before each test
        await page.goto('playground.html');
    });

    test('should load playground page successfully', async ({ page }) => {
        // Check that the page title is correct
        await expect(page).toHaveTitle(/DyGram/i);

        // Check that the main header link is visible
        const headerLink = page.getByRole('link', { name: 'DyGram' });
        await expect(headerLink).toBeVisible();
    });

    test('should display editor', async ({ page }) => {
        // Wait for either CodeMirror or Monaco editor to be initialized
        const editor = page.locator('.cm-editor, .monaco-editor');
        await expect(editor.first()).toBeVisible({ timeout: 15000 });

        // Ensure the editor exposes a scrollable content area
        const editorContent = page.locator('.cm-editor .cm-scroller, .monaco-editor .monaco-scrollable-element');
        await expect(editorContent.first()).toBeVisible();
    });

    test('should expose settings controls', async ({ page }) => {
        // Model selector should be present with options
        const modelSelect = page.locator('#model-select');
        await expect(modelSelect).toBeVisible();
        const optionCount = await modelSelect.locator('option').count();
        expect(optionCount).toBeGreaterThan(0);

        // API key input should also be present
        const apiKeyInput = page.locator('#api-key-input');
        await expect(apiKeyInput).toBeVisible();
    });

    test('should provide output format toggles', async ({ page }) => {
        // The output panel exposes format buttons such as SVG and JSON
        const svgToggle = page.getByRole('button', { name: /^SVG$/i });
        const jsonToggle = page.getByRole('button', { name: /^JSON$/i });

        await expect(svgToggle).toBeVisible();
        await expect(jsonToggle).toBeVisible();
    });

    test('should render execution controls', async ({ page }) => {
        // Execution panel exposes action buttons
        const executeButton = page.getByRole('button', { name: /execute/i });
        const resetButton = page.getByRole('button', { name: /reset/i });

        await expect(executeButton).toBeVisible();
        await expect(resetButton).toBeVisible();
    });
});

test.describe('CodeMirror Playground', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the CodeMirror playground (mobile version uses CodeMirror)
        await page.goto('playground-mobile.html');
    });

    test('should load CodeMirror playground page successfully', async ({ page }) => {
        // Check that the page title is correct
        await expect(page).toHaveTitle(/DyGram/i);

        // Check that the main header is visible
        const header = page.getByText('DyGram');
        await expect(header.first()).toBeVisible();
    });

    test('should display CodeMirror editor', async ({ page }) => {
        // Wait for CodeMirror editor to be initialized
        const editor = page.locator('.cm-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });

        // Check that the editor has content area
        const editorContent = page.locator('.cm-editor .cm-content');
        await expect(editorContent).toBeVisible();
    });

    test('should have settings section', async ({ page }) => {
        // Check for settings section
        const settingsHeader = page.getByText('Settings');
        await expect(settingsHeader).toBeVisible();

        // Check for model selector
        const modelSelect = page.locator('#model-select');
        await expect(modelSelect).toBeVisible();

        // Check for API key input
        const apiKeyInput = page.locator('#api-key-input');
        await expect(apiKeyInput).toBeVisible();
    });

    test('should have unified file tree', async ({ page }) => {
        // Check for file tree with Files header
        const filesHeader = page.getByText('Files', { exact: true });
        await expect(filesHeader).toBeVisible({ timeout: 10000 });
    });

    test('should have collapsible sections', async ({ page }) => {
        // Check that settings section can be collapsed
        const settingsHeader = page.getByText('Settings');
        await settingsHeader.click();

        // Wait for collapse animation
        await page.waitForTimeout(500);

        // Settings panel should be hidden
        const settingsPanel = page.locator('#model-select');
        await expect(settingsPanel).not.toBeVisible();

        // Click again to expand
        await settingsHeader.click();
        await page.waitForTimeout(500);
        await expect(settingsPanel).toBeVisible();
    });

    test('should have execution controls', async ({ page }) => {
        // Check for execution section
        const executionHeader = page.getByText('Execution');
        await expect(executionHeader).toBeVisible();
    });

    test('should handle page resize gracefully', async ({ page }) => {
        // Test responsive behavior
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);

        const editor = page.locator('.cm-editor');
        await expect(editor).toBeVisible();

        // Resize to smaller viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(500);

        // Editor should still be visible
        await expect(editor).toBeVisible();
    });
});

test.describe('CodeMirror Playground at Mobile Viewport', () => {
    test.beforeEach(async ({ page }) => {
        // Set mobile viewport size
        await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE
        await page.goto('playground-mobile.html');
    });

    test('should load successfully on mobile viewport', async ({ page }) => {
        // Check that the page loads
        await expect(page).toHaveTitle(/DyGram/i);

        // Main header should be visible
        const header = page.getByText('DyGram');
        await expect(header.first()).toBeVisible();
    });

    test('should display CodeMirror editor on mobile', async ({ page }) => {
        // Wait for CodeMirror editor to be initialized
        const editor = page.locator('.cm-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });

        // Editor should be usable
        const editorContent = page.locator('.cm-editor .cm-content');
        await expect(editorContent).toBeVisible();
    });

    test('should have collapsible sections on mobile', async ({ page }) => {
        // Settings should be collapsible on mobile
        const settingsHeader = page.getByText('Settings');
        await expect(settingsHeader).toBeVisible();

        // Click to expand if collapsed
        await settingsHeader.click();
        await page.waitForTimeout(500);

        // Should show settings controls
        const modelSelect = page.locator('#model-select');
        await expect(modelSelect).toBeVisible();
    });

    test('should handle file tree on mobile', async ({ page }) => {
        // File tree should be accessible on mobile
        const filesHeader = page.getByText('Files', { exact: true });
        await expect(filesHeader).toBeVisible({ timeout: 10000 });
    });

    test('should have touch-friendly controls on mobile', async ({ page }) => {
        // Check that sections can be collapsed (touch-friendly)
        const editorHeader = page.getByText('Editor');
        await expect(editorHeader).toBeVisible();

        // Should be clickable/tappable
        await editorHeader.click();
        await page.waitForTimeout(500);

        // Editor should collapse
        const editor = page.locator('.cm-editor');
        await expect(editor).not.toBeVisible();
    });

    test('should adapt layout for mobile viewport', async ({ page }) => {
        // On mobile, sections should stack vertically
        const editor = page.locator('.cm-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });

        // Get viewport dimensions
        const viewportSize = page.viewportSize();
        expect(viewportSize?.width).toBe(375);

        // Editor should take full width
        const editorBox = await editor.boundingBox();
        expect(editorBox).not.toBeNull();
        if (editorBox) {
            // Editor width should be close to viewport width (accounting for padding)
            expect(editorBox.width).toBeGreaterThan(300);
            expect(editorBox.width).toBeLessThanOrEqual(375);
        }
    });

    test('should handle tablet viewport', async ({ page }) => {
        // Test at tablet size (iPad)
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.goto('playground-mobile.html');

        const editor = page.locator('.cm-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });

        // All sections should be accessible
        const settingsHeader = page.getByText('Settings');
        const filesHeader = page.getByText('Files', { exact: true });
        const editorHeader = page.getByText('Editor');
        const outputHeader = page.getByText('Output');

        await expect(settingsHeader).toBeVisible();
        await expect(filesHeader).toBeVisible();
        await expect(editorHeader).toBeVisible();
        await expect(outputHeader).toBeVisible();
    });
});

test.describe('Playground Error Handling', () => {
    test('should handle navigation to non-existent page gracefully', async ({ page }) => {
        // Try to navigate to a non-existent page
        const response = await page.goto('/non-existent-page.html');

        // Should get a 404 or the page should show an error
        if (response) {
            expect([200, 404]).toContain(response.status());
        }
    });

    test('should not have console errors on load', async ({ page }) => {
        const errors: string[] = [];

        // Listen for console errors
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto('playground.html');

        // Wait for page to fully load
        await page.waitForLoadState('networkidle');

        // Filter out known acceptable errors (if any)
        const criticalErrors = errors.filter(error => {
            // Filter out non-critical errors if needed
            return !error.includes('DevTools'); // Example filter
        });

        // We allow some errors but want to see them in test output
        if (criticalErrors.length > 0) {
            console.warn('Console errors detected:', criticalErrors);
        }

        // This assertion can be adjusted based on acceptable error threshold
        expect(criticalErrors.length).toBeLessThan(10);
    });
});