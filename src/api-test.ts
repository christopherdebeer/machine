// API Test Page Logic

declare global {
    interface Window {
        testAPI: () => Promise<void>;
    }
}

async function testAPI() {
    const responseElement = document.getElementById('response');
    const button = document.getElementById('testBtn') as HTMLButtonElement;

    if (!responseElement || !button) return;

    // Show loading state
    responseElement.className = 'response-text loading';
    responseElement.textContent = 'Loading...';
    button.disabled = true;

    try {
        const response = await fetch('/api/hello');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Show success
        responseElement.className = 'response-text';
        responseElement.textContent = data.message || 'No message received';

    } catch (error) {
        // Show error
        responseElement.className = 'response-text error';
        responseElement.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    } finally {
        button.disabled = false;
    }
}

// Make testAPI available globally
window.testAPI = testAPI;

// Export for module compatibility
export { testAPI };
