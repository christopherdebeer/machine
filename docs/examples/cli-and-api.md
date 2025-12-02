# CLI and API Usage

Running examples from command line and programmatic integration.

## CLI Usage

### Basic Commands

Validate a machine definition:
```bash
dygram parseAndValidate examples/basic/hello.dygram
```

Generate JSON output:
```bash
dygram generate examples/basic/hello.dygram
```

Generate visualization:
```bash
dygram generate examples/workflows/pipeline.dy --format html
```

### Execution with LLM

Set up API key:
```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

Execute a machine:
```bash
dygram execute examples/llm/basic-task.dygram
```

Execute with options:
```bash
dygram execute examples/llm/basic-task.dy \
  --model claude-3-5-sonnet-20241022 \
  --temperature 0.7 \
  --max-tokens 2048
```

### Working with Files

Parse multiple files:
```bash
dygram parseAndValidate examples/**/*.dygram
```

Generate with output file:
```bash
dygram generate examples/basic/hello.dy \
  --output output/hello.json
```

Watch mode (auto-regenerate):
```bash
dygram generate examples/basic/hello.dy \
  --watch \
  --format html
```

## API Usage

### Basic Parsing and Validation

```typescript
import { createMachineServices } from 'dygram';
import { NodeFileSystem } from 'langium/node';

// Create services
const services = createMachineServices(NodeFileSystem).Machine;

// Parse a file
const document = services.shared.workspace.LangiumDocuments.getOrCreateDocument(
    URI.file('examples/basic/hello.dy')
);

// Build and validate
await services.shared.workspace.DocumentBuilder.build([document]);

// Check for errors
const validationErrors = document.diagnostics ?? [];
if (validationErrors.length > 0) {
    console.error('Validation errors:', validationErrors);
}
```

### Generating JSON

```typescript
import { generateJSON } from 'dygram';
import { extractAstNode } from 'dygram/utils';

// Extract AST
const services = createMachineServices(NodeFileSystem).Machine;
const machine = await extractAstNode(
    'examples/basic/hello.dy',
    services
);

// Generate JSON
const result = generateJSON(machine, 'hello.dy');
console.log(result.content);
```

### Generating Diagrams

```typescript
import { generateGraphvizFromJSON, renderDotToSVG } from 'dygram/diagram';

// Generate DOT syntax
const dotDiagram = generateGraphvizFromJSON(machineJson, {
    title: 'My Machine',
    showRuntimeState: false
});

// Render to SVG
const svg = await renderDotToSVG(dotDiagram);
console.log(svg);
```

### Diagram Options

```typescript
import { DiagramOptions } from 'dygram/diagram';

const options: DiagramOptions = {
    // Runtime visualization
    showRuntimeState: true,
    showExecutionPath: true,
    showVisitCounts: true,
    showRuntimeValues: true,

    // Validation warnings
    showValidationWarnings: true,
    warningMode: 'both',  // 'inline' | 'notes' | 'both' | 'none'
    minSeverity: 'warning',  // 'error' | 'warning' | 'info' | 'hint'

    // Display options
    mobileOptimized: false,
    title: 'Custom Title',

    // Context for template interpolation
    runtimeContext: executionContext,
    validationContext: validationContext
};

const diagram = generateGraphvizFromJSON(machineJson, options);
```

### Runtime Visualization

```typescript
import { generateRuntimeGraphviz, RuntimeContext } from 'dygram/diagram';

// Create runtime context
const context: RuntimeContext = {
    currentNode: 'analyze',
    currentTaskNode: 'analyze',
    activeState: undefined,
    errorCount: 0,
    visitedNodes: new Set(['input', 'analyze']),
    attributes: new Map([
        ['input.text', 'Sample input'],
        ['analyze.result', 'Analysis result']
    ]),
    history: [
        {
            from: 'input',
            to: 'analyze',
            transition: 'process',
            timestamp: new Date().toISOString()
        }
    ],
    nodeInvocationCounts: new Map([
        ['input', 1],
        ['analyze', 2]
    ])
};

// Generate runtime diagram
const runtimeDiagram = generateRuntimeGraphviz(
    machineJson,
    context,
    {
        showRuntimeState: true,
        showVisitCounts: true,
        showExecutionPath: true
    }
);

const svg = await renderDotToSVG(runtimeDiagram);
```

### Executing Machines

```typescript
import { MachineExecutor } from 'dygram/executor';
import { ClaudeClient } from 'dygram/llm';

// Create LLM client
const claudeClient = new ClaudeClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'
});

// Create executor
const executor = new MachineExecutor(machine, claudeClient);

// Execute
const result = await executor.execute({
    startNode: 'input',
    initialContext: {
        'input.text': 'Hello, world!'
    }
});

console.log('Execution result:', result);
console.log('Final context:', executor.getContext());
```

### Custom Validation

```typescript
import { ValidationContext, ValidationSeverity } from 'dygram/validation';

// Create validation context
const validationContext = new ValidationContext();

// Add custom validation
validationContext.addIssue({
    node: 'taskNode',
    severity: ValidationSeverity.Warning,
    message: 'Task may timeout',
    code: 'TIMEOUT_WARNING'
});

// Use in diagram generation
const diagram = generateGraphvizFromJSON(machineJson, {
    validationContext,
    showValidationWarnings: true,
    warningMode: 'both',
    minSeverity: 'warning'
});
```

### Working with Nested Nodes

```typescript
// Access nested nodes via qualified names
const nestedNode = machine.nodes.find(
    n => n.name === 'parent.child.grandchild'
);

// Or traverse hierarchy
function findNestedNode(parent: Node, path: string[]): Node | undefined {
    if (path.length === 0) return parent;

    const [first, ...rest] = path;
    const child = parent.nodes?.find(n => n.name === first);

    return child ? findNestedNode(child, rest) : undefined;
}

const node = findNestedNode(rootNode, ['parent', 'child', 'grandchild']);
```

### Custom Code Generation

```typescript
import { Machine } from 'dygram/ast';

function generateCustomOutput(machine: Machine): string {
    let output = `# ${machine.title}\n\n`;

    // Generate custom format
    for (const node of machine.nodes) {
        output += `## ${node.type}: ${node.name}\n`;

        if (node.attributes) {
            for (const attr of node.attributes) {
                output += `  - ${attr.name}: ${attr.value}\n`;
            }
        }

        output += '\n';
    }

    return output;
}

const customOutput = generateCustomOutput(machine);
console.log(customOutput);
```

### Integration with Build Tools

#### Webpack Plugin

```typescript
// webpack.config.js
import { DygramPlugin } from 'dygram-webpack-plugin';

export default {
    plugins: [
        new DygramPlugin({
            include: '**/*.dy',
            generateJson: true,
            generateDiagrams: true,
            outputDir: 'dist/machines'
        })
    ]
};
```

#### Vite Plugin

```typescript
// vite.config.ts
import { dygram } from 'dygram-vite-plugin';

export default {
    plugins: [
        dygram({
            include: ['**/*.dy'],
            hot: true  // Hot reload on changes
        })
    ]
};
```

### Testing Machines

```typescript
import { describe, it, expect } from 'vitest';
import { createMachineServices } from 'dygram';

describe('Machine Tests', () => {
    it('should parse machine without errors', async () => {
        const services = createMachineServices(NodeFileSystem).Machine;
        const machine = await extractAstNode('test.dy', services);

        expect(machine).toBeDefined();
        expect(machine.nodes.length).toBeGreaterThan(0);
    });

    it('should generate valid JSON', () => {
        const json = generateJSON(machine, 'test.dy');

        expect(json.content).toContain('"title"');
        expect(json.content).toContain('"nodes"');
    });

    it('should execute successfully', async () => {
        const executor = new MachineExecutor(machine, mockClient);
        const result = await executor.execute();

        expect(result.success).toBe(true);
        expect(result.errors).toHaveLength(0);
    });
});
```

## Environment Variables

```bash
# Anthropic API
ANTHROPIC_API_KEY=your_key_here

# AWS Bedrock (alternative)
AWS_REGION=us-west-2
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret

# Configuration
DYGRAM_LOG_LEVEL=info  # debug, info, warn, error
DYGRAM_TIMEOUT=60000   # Execution timeout in ms
DYGRAM_MAX_RETRIES=3   # Max retry attempts
```

## Configuration File

Create `.dygramrc.json`:

```json
{
    "defaultModel": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "maxTokens": 2048,
    "timeout": 60000,
    "retries": 3,
    "diagrams": {
        "format": "svg",
        "showRuntimeState": true,
        "showWarnings": true,
        "warningMode": "both",
        "minSeverity": "warning"
    },
    "validation": {
        "strictMode": false,
        "checkUnusedNodes": true,
        "checkCircularDependencies": true
    }
}
```

## Next Steps

- **[Syntax Reference](../syntax/README.md)** - Language syntax details
- **[API Reference](../api/README.md)** - Complete API documentation
- **[CLI Reference](../cli/README.md)** - All CLI commands and options
