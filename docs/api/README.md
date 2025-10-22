# DyGram API Reference

Programmatic API for integrating DyGram into your applications.

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
const content = await fs.readFile('workflow.dygram', 'utf-8');
const document = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(
    URI.file('workflow.dygram'),
    content
);

// Get parsed AST
const machine = document.parseResult.value as Machine;
```

### Generate JSON

```typescript
import { generateJSON } from 'dygram/generator';

const result = generateJSON(machine, 'workflow.dygram');
console.log(result.content); // JSON string
```

### Execute a Machine

```typescript
import { RailsExecutor } from 'dygram';

const executor = new RailsExecutor(machineData, {
    modelId: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY
});

await executor.execute();
```

## Core Modules

### `createMachineServices`

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
    Note
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
    notes: Note[];
}

interface Node {
    type?: string;  // e.g., "Task", "State"
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

await parseAndValidate('workflow.dygram', { verbose: true });
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

const validator = new GraphValidator();
const issues = validator.validate(machine);

// Check for specific issues
const unreachableNodes = issues.filter(i => i.type === 'unreachable');
const cycles = issues.filter(i => i.type === 'cycle');
```

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

### Rails Executor

Execute machines using the Rails-Based Architecture:

```typescript
import { RailsExecutor, type MachineData } from 'dygram/executor';

// Parse machine to JSON
const machineData: MachineData = JSON.parse(jsonContent);

// Create executor
const executor = new RailsExecutor(machineData, {
    modelId: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Execute
await executor.execute();
```

**Configuration Options**:

```typescript
interface ExecutorOptions {
    modelId?: string;        // LLM model ID
    apiKey?: string;          // Anthropic API key
    verbose?: boolean;        // Verbose logging
    maxRetries?: number;      // Max retry attempts
    timeout?: number;         // Execution timeout (ms)
}
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
