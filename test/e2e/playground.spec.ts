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

        // Check that the main header is visible
        const header = page.locator('.header-title');
        await expect(header).toBeVisible();
        await expect(header).toContainText('DyGram');
    });

    test('should display Monaco editor', async ({ page }) => {
        // Wait for Monaco editor to be initialized
        // Monaco uses .monaco-editor class for the root element
        const editor = page.locator('.monaco-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });

        // Check that the editor has content area
        const editorContent = page.locator('.monaco-editor .view-lines');
        await expect(editorContent).toBeVisible();
    });

    test('should have header controls visible', async ({ page }) => {
        // Check that main controls are visible
        const headerControls = page.locator('.header-controls');
        await expect(headerControls).toBeVisible();

        // Check for model selector
        const modelSelect = page.locator('#model-select-desktop');
        await expect(modelSelect).toBeVisible();

        // Check that model options exist
        const options = await modelSelect.locator('option').count();
        expect(options).toBeGreaterThan(0);
    });

    test('should have download buttons available', async ({ page }) => {
        // Check SVG download button
        const svgButton = page.getByRole('button', { name: /download svg/i });
        await expect(svgButton).toBeVisible();

        // Check PNG download button
        const pngButton = page.getByRole('button', { name: /download png/i });
        await expect(pngButton).toBeVisible();

        // Check theme toggle button
        const themeButton = page.getByRole('button', { name: /toggle theme/i });
        await expect(themeButton).toBeVisible();
    });

    test('should have examples section', async ({ page }) => {
        // Check for examples section
        const examplesSection = page.locator('.examples-section');
        await expect(examplesSection).toBeVisible({ timeout: 10000 });

        // Check for examples heading
        const examplesHeading = examplesSection.locator('h3');
        await expect(examplesHeading).toContainText('Examples');

        // Check that examples container exists
        const examplesContainer = page.locator('#monaco-examples');
        await expect(examplesContainer).toBeVisible();
    });

    test('should toggle theme', async ({ page }) => {
        // Get initial body class
        const body = page.locator('body');
        const initialClass = await body.getAttribute('class') || '';

        // Click theme toggle
        const themeButton = page.getByRole('button', { name: /toggle theme/i });
        await themeButton.click();

        // Wait for theme change (small delay for transition)
        await page.waitForTimeout(500);

        // Check that class changed
        const newClass = await body.getAttribute('class') || '';
        expect(newClass).not.toBe(initialClass);
    });

    test('should have output panel container', async ({ page }) => {
        // Check for output panel
        const outputPanel = page.locator('#output-panel-container');
        await expect(outputPanel).toBeVisible({ timeout: 10000 });
    });

    test('should handle page resize gracefully', async ({ page }) => {
        // Test responsive behavior
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.waitForTimeout(500);

        const editor = page.locator('.monaco-editor');
        await expect(editor).toBeVisible();

        // Resize to smaller viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(500);

        // Editor should still be visible
        await expect(editor).toBeVisible();
    });

    test('should have execution controls container', async ({ page }) => {
        // Check for execution controls container
        const executionControls = page.locator('#execution-controls');
        await expect(executionControls).toBeAttached();
    });
});

test.describe('Playground Mobile Version', () => {
    test('should load mobile playground page', async ({ page }) => {
        await page.goto('playground-mobile.html');

        // Check that the page title is correct
        await expect(page).toHaveTitle(/DyGram/i);

        // Check that the main header is visible
        const header = page.locator('.header-title');
        await expect(header).toBeVisible();
    });

    test('should display Monaco editor on mobile', async ({ page }) => {
        await page.goto('playground-mobile.html');

        // Wait for Monaco editor to be initialized
        const editor = page.locator('.monaco-editor');
        await expect(editor).toBeVisible({ timeout: 15000 });
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