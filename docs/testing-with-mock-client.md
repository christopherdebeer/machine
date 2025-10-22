# Testing with Mock Claude Client

The Mock Claude Client allows you to test DyGram execution flows without requiring a real Anthropic API key. This is useful for:

- **Development**: Test your machine definitions locally without API costs
- **CI/CD**: Run automated tests in continuous integration environments
- **Demos**: Demonstrate functionality without exposing API keys
- **Playwright Tests**: Automate UI testing with predictable responses

## How It Works

The `MockClaudeClient` implements the same interface as the real `ClaudeClient` but returns predictable mock responses instead of calling the Anthropic API.

## Usage

### Automatic Mock Fallback

The easiest way is to simply omit the API key. The system will automatically use the mock client:

```typescript
import { createClaudeClientWithMockFallback } from './language/llm-client.js';

// No API key provided → automatically uses MockClaudeClient
const client = createClaudeClientWithMockFallback({
    provider: 'anthropic',
    apiKey: '', // Empty or omitted
    modelId: 'claude-3-5-haiku-20241022'
});

// This will use mock responses
const response = await client.invokeModel('Analyze this task');
```

### Explicit Mock Usage

You can also explicitly create a mock client:

```typescript
import { MockClaudeClient } from './language/mock-claude-client.js';

const mockClient = new MockClaudeClient({
    modelId: 'mock-claude-3-5-haiku'
});

const response = await mockClient.invokeModel('Process this data');
console.log(response); // "Processing complete. The data has been processed successfully."
```

### In Playgrounds

The Monaco and CodeMirror playgrounds automatically use the mock client when no API key is configured:

1. Open the playground (e.g., `playground.html` or `playground-mobile.html`)
2. Leave the API Key field empty
3. Run your machine definition
4. The mock client will provide simulated responses for Task nodes

This allows you to:
- Test diagram rendering
- Verify machine structure
- See execution flows
- Debug without API costs

### With Playwright

Perfect for automated browser testing:

```typescript
import { test } from '@playwright/test';

test('test playground without API key', async ({ page }) => {
    await page.goto('http://localhost:3000/playground.html');

    // Don't enter API key - mock client will be used automatically

    // Click run button
    await page.click('#run-btn');

    // Verify diagram appears
    await expect(page.locator('#output-panel-container svg')).toBeVisible();
});
```

## Mock Responses

The mock client returns context-aware responses based on prompt keywords:

| Prompt Contains | Response |
|----------------|----------|
| "analyze" | "Analysis complete. The task has been analyzed successfully." |
| "process" | "Processing complete. The data has been processed successfully." |
| "generate" | "Generated content successfully." |
| (default) | "Mock response: Task completed successfully." |

### Tool Support

When tools are provided, the mock client will:
1. Select the first available tool
2. Generate mock input based on the tool's schema
3. Return a `tool_use` response

Example:

```typescript
const response = await mockClient.invokeWithTools(
    [{ role: 'user', content: 'Use a tool' }],
    [{
        name: 'search',
        description: 'Search for information',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string' }
            }
        }
    }]
);

// Returns:
// {
//   content: [
//     { type: 'text', text: 'Mock response: Using tool search' },
//     { type: 'tool_use', id: 'mock_tool_123', name: 'search', input: { query: 'mock_query' } }
//   ],
//   stop_reason: 'tool_use'
// }
```

## Limitations

The mock client is designed for testing structure and flow, not content quality:

- **No real AI**: Responses are predetermined, not intelligent
- **No state**: Each call is independent
- **Simple logic**: Basic keyword matching only
- **Fixed delays**: Simulates ~100-150ms API latency

## Best Practices

1. **Use for Structure**: Test that your machine definitions parse and execute correctly
2. **Verify Flow**: Ensure execution paths work as expected
3. **Switch to Real**: Use real API for content quality validation
4. **CI/CD**: Great for smoke tests and integration tests
5. **Playwright**: Perfect for automated UI testing

## Example: Full Workflow

```typescript
import { RailsExecutor } from './language/rails-executor.js';
import { createClaudeClientWithMockFallback } from './language/llm-client.js';

// Machine definition with a Task node
const machineData = {
    title: "Test Machine",
    nodes: [
        { name: "start", type: "State" },
        {
            name: "analyze",
            type: "Task",
            attributes: [
                { name: "prompt", type: "string", value: "Analyze the input" }
            ]
        },
        { name: "end", type: "State" }
    ],
    edges: [
        { source: "start", target: "analyze", label: "begin" },
        { source: "analyze", target: "end", label: "complete" }
    ]
};

// Create executor with mock client (no API key)
const executor = await RailsExecutor.create(machineData, {
    llm: {
        provider: 'anthropic',
        apiKey: '', // Empty → uses mock
        modelId: 'claude-3-5-haiku-20241022'
    }
});

// Execute steps - uses mock responses
while (await executor.step()) {
    console.log('Step completed:', executor.getContext().currentNode);
}

console.log('Execution complete!');
```

## Debugging

The mock client logs all operations to the console:

```
[MockClaudeClient] Initialized with model: mock-claude-3-5-haiku
[MockClaudeClient] invokeModel called with prompt: Analyze the input...
[createClaudeClientWithMockFallback] No API key provided, using MockClaudeClient
```

Enable these logs to verify the mock client is being used correctly.
