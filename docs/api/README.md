# API Reference

Programmatic API for integrating DyGram into your applications.

## Table of Contents

## Installation

```bash
npm install dygram
```

## Quick Start

### Parse a DyGram File

```typescript
import { createMachineServices } from 'dygram';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'fs/promises';

// Create language services
const services = createMachineServices(NodeFileSystem).Machine;

// Read and parse file
const content = await fs.readFile('workflow.dy', 'utf-8');
const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
    URI.file('workflow.dy'),
    content
);

// Get parsed AST
const machine = document.parseResult.value as Machine;
```

### Generate JSON

```typescript
import { generateJSON } from 'dygram/generator';

const result = generateJSON(machine, 'workflow.dy');
console.log(result.content); // JSON string
```

### Execute a Machine

```typescript
import { MachineExecutor } from 'dygram';

const executor = await MachineExecutor.create(machineData, {
    llm: {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY
    }
});

await executor.execute();
```

## Core Modules

### createMachineServices

Creates Langium language services for parsing DyGram files.

```typescript
import { createMachineServices } from 'dygram';
import { NodeFileSystem } from 'langium/node';

const services = createMachineServices(NodeFileSystem);
const machineServices = services.Machine;
```

**Returns**: `MachineServices` object with:
- `parser` - Parse DyGram source
- `validator` - Validate parsed AST
- `serializer` - Serialize to JSON
- `shared.workspace` - Workspace management

### AST Types

Core AST node types generated from the grammar:

```typescript
import type {
    Machine,
    Node,
    Edge,
    Attribute,
    Annotation,
} from 'dygram/ast';
```

**Key Types**:

```typescript
interface Machine {
    title?: string;
    annotations: Annotation[];
    attributes: Attribute[];
    nodes: Node[];
    edges: Edge[];
}

interface Node {
    type?: string;  // e.g., "task", "state", "note", "style", ...
    name: string;
    title?: string;
    annotations: Annotation[];
    attributes: Attribute[];
    nodes: Node[];  // nested nodes
    edges: Edge[];
}

interface Edge {
    source: Node[];
    segments: EdgeSegment[];
}

interface Attribute {
    name: string;
    type?: TypeDef;
    value?: AttributeValue;
}
```

## Parsing and Validation

### Parse and Validate

```typescript
import { parseAndValidate } from 'dygram/cli';

await parseAndValidate('workflow.dy', { verbose: true });
```

### Access Parse Errors

```typescript
const document = await services.shared.workspace.LangiumDocuments
    .getOrCreateDocument(uri, content);

const parseResult = document.parseResult;

// Check for errors
if (parseResult.lexerErrors.length > 0) {
    console.error('Lexer errors:', parseResult.lexerErrors);
}

if (parseResult.parserErrors.length > 0) {
    console.error('Parser errors:', parseResult.parserErrors);
}

// Get validation diagnostics
await services.validation.DocumentValidator.validateDocument(document);
const diagnostics = document.diagnostics ?? [];
```

### Graph Validation

```typescript
import { GraphValidator } from 'dygram/validator';

const validator = new GraphValidator(machine);
const result = validator.validate();

// Check for specific issues
console.log('Unreachable nodes:', result.unreachableNodes);
console.log('Orphaned nodes:', result.orphanedNodes);
console.log('Cycles:', result.cycles);
```

### Validation Context

The `ValidationContext` collects validation errors and warnings that can be visualized in diagrams:

```typescript
import { ValidationContext, ValidationSeverity, ValidationCategory } from 'dygram';

// Create context
const context = new ValidationContext();

// Add errors
context.addError({
    message: 'Node cannot be reached',
    severity: ValidationSeverity.WARNING,
    category: ValidationCategory.GRAPH,
    code: 'UNREACHABLE_NODE',
    location: { node: 'taskName' }
});

// Get errors by severity
const warnings = context.getErrors(ValidationSeverity.WARNING);
const errors = context.getErrors(ValidationSeverity.ERROR);

// Pass to diagram generator for visualization
const dot = generateGraphvizFromJSON(machineJson, {
    validationContext: context,
    showValidationWarnings: true,
    warningMode: 'both', // 'inline', 'notes', 'both', 'none'
    minSeverity: 'warning'
});
```

**Validation Options**:
- `showValidationWarnings`: Enable/disable warning visualization
- `warningMode`: How to display warnings
  - `'inline'`: Style nodes with warning colors
  - `'notes'`: Create separate note nodes
  - `'both'`: Both inline styling and notes
  - `'none'`: No visualization
- `minSeverity`: Minimum severity to display (`'error'`, `'warning'`, `'info'`, `'hint'`)

**Severity Levels**:
- `ValidationSeverity.ERROR`: Critical errors
- `ValidationSeverity.WARNING`: Non-critical issues
- `ValidationSeverity.INFO`: Informational messages
- `ValidationSeverity.HINT`: Suggestions

**Category Types**:
- `ValidationCategory.GRAPH`: Graph structure issues
- `ValidationCategory.TYPE`: Type checking errors
- `ValidationCategory.SYNTAX`: Syntax problems
- `ValidationCategory.SEMANTIC`: Semantic errors

## Generation

### Generate JSON

```typescript
import { generateJSON } from 'dygram/generator';

const result = generateJSON(machine, sourcePath, destinationDir);
// result.filePath - output file path
// result.content - JSON string
```

### Generate Mermaid

```typescript
import { generateMermaid } from 'dygram/generator';

const result = generateMermaid(machine, sourcePath, destinationDir);
// result.filePath - output file path
// result.content - Mermaid diagram syntax
```

### Generate Graphviz/DOT

```typescript
import { generateGraphviz } from 'dygram/generator';

const result = generateGraphviz(machine, sourcePath, destinationDir);
// result.filePath - output file path
// result.content - DOT graph syntax
```

### Generate HTML

```typescript
import { generateHTML } from 'dygram/generator';

const result = generateHTML(machine, sourcePath, destinationDir);
// result.filePath - output file path
// result.content - HTML with embedded diagram
```

### Generate DSL (Backward Compilation)

```typescript
import { generateDSL } from 'dygram/generator';

// Convert JSON back to DyGram source
const machineJson = JSON.parse(jsonContent);
const dslContent = generateDSL(machineJson);
```

## Execution

### Machine Executor

Execute machines using the functional execution runtime:

```typescript
import { MachineExecutor, type MachineJSON } from 'dygram/executor';

// Parse machine to JSON
const machineData: MachineJSON = JSON.parse(jsonContent);

// Create executor with async LLM client initialization
const executor = await MachineExecutor.create(machineData, {
    llm: {
        provider: 'anthropic',
        modelId: 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY
    },
    limits: {
        maxSteps: 1000,
        maxNodeInvocations: 100,
        timeout: 300000  // 5 minutes
    },
    logLevel: 'info'
});

// Execute all paths to completion
await executor.execute();

// Or execute single step
const continued = await executor.step();

// Get current state
const state = executor.getState();

// Get visualization data
const vizState = executor.getVisualizationState();
```

**Configuration Options**:

```typescript
interface MachineExecutorConfig {
    llm?: {
        provider: 'anthropic';
        modelId: string;
        apiKey: string;
    };
    limits?: {
        maxSteps?: number;              // Max total steps
        maxNodeInvocations?: number;    // Max visits per node
        timeout?: number;               // Timeout in milliseconds
        cycleDetectionWindow?: number;  // Cycle detection window
    };
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    vfs?: {
        writeFile(path: string, content: string): void;
        readFile(path: string): string | undefined;
        exists(path: string): boolean;
    };
}
```

**Execution State**:

```typescript
// Get current execution state
const state = executor.getState();

// State includes:
// - paths: Array of execution paths (multi-path support)
// - metadata: Step count, elapsed time, error count
// - machineSnapshot: Current machine definition

// Get visualization state
const vizState = executor.getVisualizationState();

// Visualization state includes:
// - activePaths: Currently executing paths
// - allPaths: All paths (active, completed, failed)
// - nodeStates: Visit counts and active status per node
// - availableTransitions: Next possible transitions
```

**Checkpoints**:

```typescript
// Create checkpoint
const checkpoint = executor.createCheckpoint('Before critical section');

// Restore from checkpoint
executor.restoreCheckpoint(checkpoint);

// Serialize state
const serialized = executor.serializeState();

// Deserialize state
const state = MachineExecutor.deserializeState(serialized);
```

### Claude Client

Direct Claude API integration:

```typescript
import { ClaudeClient } from 'dygram/client';

const client = new ClaudeClient({
    apiKey: process.env.ANTHROPIC_API_KEY,
    modelId: 'claude-3-5-sonnet-20241022'
});

const response = await client.sendMessage({
    prompt: 'Hello, Claude!',
    systemPrompt: 'You are a helpful assistant',
    maxTokens: 1024
});
```

### LLM Client Interface

Generic LLM client interface for extensibility:

```typescript
import type { LLMClient } from 'dygram/client';

class CustomLLMClient implements LLMClient {
    async sendMessage(params: MessageParams): Promise<MessageResponse> {
        // Custom implementation
    }
}
```

## Dependency Analysis

Analyze node dependencies from template variables:

```typescript
import { DependencyAnalyzer } from 'dygram/analyzer';

const analyzer = new DependencyAnalyzer();
const dependencies = analyzer.analyze(machine);

// Get dependencies for a specific node
const nodeDeps = dependencies.get('taskName');
// Returns: Set<string> of node names this task depends on
```

## Code Generation

Generate executable code from machines (experimental):

```typescript
import { CodeGenerator } from 'dygram/codegen';

const generator = new CodeGenerator();
const code = generator.generate(machine, {
    language: 'typescript',
    includeTypes: true
});
```

## TypeScript Support

DyGram includes full TypeScript type definitions:

```typescript
import type {
    Machine,
    Node,
    Edge,
    Attribute,
    Annotation,
    TypeDef,
    AttributeValue
} from 'dygram/ast';

import type {
    MachineServices,
    FileGenerationResult
} from 'dygram';

import type {
    MachineData,
    ExecutorOptions,
    MessageParams,
    MessageResponse
} from 'dygram/executor';
```

## Web Integration

For browser environments:

```typescript
import { createMachineServices } from 'dygram/web';
import { BrowserFileSystem } from 'langium';

const services = createMachineServices(BrowserFileSystem);
```

**Note**: Web bundle includes shims for Node.js modules.

## Error Handling

```typescript
try {
    const machine = await extractAstNode<Machine>(fileName, services);
} catch (error) {
    if (error instanceof ValidationError) {
        console.error('Validation failed:', error.issues);
    } else if (error instanceof ParseError) {
        console.error('Parse failed:', error.message);
    } else {
        console.error('Unexpected error:', error);
    }
}
```

## Examples

### Complete Parsing Example

```typescript
import { createMachineServices } from 'dygram';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'fs/promises';
import * as path from 'path';
import { URI } from 'vscode-uri';

async function parseDyGramFile(filePath: string) {
    // Create services
    const services = createMachineServices(NodeFileSystem).Machine;

    // Read file
    const content = await fs.readFile(filePath, 'utf-8');
    const uri = URI.file(path.resolve(filePath));

    // Parse
    const document = services.shared.workspace.LangiumDocuments
        .getOrCreateDocument(uri);
    await services.shared.workspace.DocumentBuilder.build([document]);

    // Check for errors
    if (document.parseResult.lexerErrors.length > 0 ||
        document.parseResult.parserErrors.length > 0) {
        throw new Error('Parse errors occurred');
    }

    // Return AST
    return document.parseResult.value as Machine;
}
```

### Generation Pipeline

```typescript
import { generateJSON, generateHTML } from 'dygram/generator';

async function buildPipeline(machine: Machine, sourcePath: string) {
    // Generate JSON
    const jsonResult = generateJSON(machine, sourcePath, './output');
    console.log(`Generated: ${jsonResult.filePath}`);

    // Generate HTML visualization
    const htmlResult = generateHTML(machine, sourcePath, './output');
    console.log(`Generated: ${htmlResult.filePath}`);

    return {
        json: jsonResult.filePath,
        html: htmlResult.filePath
    };
}
```

## Next Steps

- **[CLI Reference](../cli/README.md)** - Command-line tools
- **[Syntax Reference](../syntax/README.md)** - Language syntax
- **[Examples](../examples/README.md)** - Practical patterns

---

**Source Code**: See [src/language/](../../src/language/) for implementation details
