import { test, expect } from '@playwright/test';

/**
 * E2E Tests for API Test Page
 *
 * These tests validate that the API test page loads correctly,
 * can call the /api/hello endpoint, and displays the "yellow world" response.
 */

test.describe('API Test Page', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the API test page before each test
        await page.goto('api-test.html');
    });

    test('should load API test page successfully', async ({ page }) => {
        // Check that the page title is correct
        await expect(page).toHaveTitle(/API Test/i);

        // Check that the main heading is visible
        const heading = page.locator('h1');
        await expect(heading).toBeVisible();
        await expect(heading).toContainText('API Test Page');
    });

    test('should display test button', async ({ page }) => {
        // Check that the test button is visible
        const button = page.locator('#testBtn');
        await expect(button).toBeVisible();
        await expect(button).toContainText('Call API');
    });

    test('should show initial message', async ({ page }) => {
        // Check that the initial response message is displayed
        const response = page.locator('#response');
        await expect(response).toBeVisible();
        await expect(response).toContainText('Click the button to test the API');
    });

    test('should call API and display "yellow world" message', async ({ page }) => {
        // Click the test button
        const button = page.locator('#testBtn');
        await button.click();

        // Wait for the response to change from loading
        const response = page.locator('#response');

        // Wait for either success or error, but not loading
        await expect(response).not.toContainText('Loading...', { timeout: 10000 });

        // Check that we got the "yellow world" response
        await expect(response).toContainText('yellow world');

        // Verify the response doesn't show an error
        await expect(response).not.toHaveClass(/error/);
    });

    test('should re-enable button after API call completes', async ({ page }) => {
        const button = page.locator('#testBtn');

        // Button should be enabled initially
        await expect(button).toBeEnabled();

        // Click the button
        await button.click();

        // Wait for the API call to complete (response changes from loading)
        const response = page.locator('#response');
        await expect(response).not.toContainText('Loading...', { timeout: 10000 });

        // Button should be enabled again
        await expect(button).toBeEnabled();
    });

    test('should display info section', async ({ page }) => {
        // Check that the info section is visible
        const info = page.locator('.info');
        await expect(info).toBeVisible();

        // Check that it contains information about the endpoint
        await expect(info).toContainText('/api/hello');
        await expect(info).toContainText('yellow world');
    });
});

test.describe('API Endpoint Direct Test', () => {
    test('should return correct JSON from /api/hello endpoint', async ({ page }) => {
        // Directly test the API endpoint
        const response = await page.goto('/api/hello');

        // Check that the response is successful
        expect(response?.status()).toBe(200);

        // Get the JSON response
        const json = await response?.json();

        // Verify the response structure and content
        expect(json).toHaveProperty('message');
        expect(json.message).toBe('yellow world');
    });
});
