# Import System Design Considerations

This document outlines the design considerations for implementing an import/module system for DyGram machines.

## Goals

1. **Code Reusability**: Allow machines to share common definitions (templates, attributes, nodes)
2. **Dependency Management**: Handle dependencies between machine files
3. **Consistent Interface**: Work seamlessly in both playground and CLI environments
4. **Namespace Management**: Avoid naming conflicts between imported definitions

## Proposed Syntax

### Basic Import

```dy
import "shared/templates.dy" as templates;

machine "MyMachine" {
    use templates.ErrorHandling;

    start -> process -> end;
}
```

### Selective Import

```dy
import { ErrorHandling, Logging } from "shared/templates.dy";

machine "MyMachine" {
    use ErrorHandling;
    use Logging;

    start -> process -> end;
}
```

### Relative and Absolute Paths

```dy
// Relative to current file
import "./shared/types.dy" as types;

// Absolute from working directory
import "/common/templates.dy" as common;

// Package-style imports (future)
import "@dygram/stdlib/http" as http;
```

## Architecture Components

### 1. Module Resolution

**Responsibilities:**
- Resolve import paths relative to current file
- Handle working directory context
- Support both filesystem and URL-based imports
- Cache resolved modules

**Implementation Strategy:**
```typescript
interface ModuleResolver {
    resolve(importPath: string, currentFile: string): Promise<string>;
    load(resolvedPath: string): Promise<string>;
}

class FileSystemResolver implements ModuleResolver {
    constructor(private workingDir: string) {}

    async resolve(importPath: string, currentFile: string): Promise<string> {
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            return path.resolve(path.dirname(currentFile), importPath);
        }
        return path.join(this.workingDir, importPath);
    }

    async load(resolvedPath: string): Promise<string> {
        return fs.readFile(resolvedPath, 'utf-8');
    }
}
```

### 2. Dependency Graph

**Responsibilities:**
- Track dependencies between files
- Detect circular dependencies
- Determine compilation order
- Enable incremental recompilation

**Implementation Strategy:**
```typescript
class DependencyGraph {
    private edges: Map<string, Set<string>> = new Map();

    addDependency(from: string, to: string) {
        if (!this.edges.has(from)) {
            this.edges.set(from, new Set());
        }
        this.edges.get(from)!.add(to);
    }

    detectCycles(): string[][] {
        // Implement cycle detection algorithm
    }

    topologicalSort(): string[] {
        // Return compilation order
    }
}
```

### 3. Symbol Table / Namespace Management

**Responsibilities:**
- Track exported symbols from each module
- Handle import aliases
- Resolve qualified names (e.g., `templates.ErrorHandling`)
- Detect naming conflicts

**Implementation Strategy:**
```typescript
interface ExportedSymbol {
    name: string;
    type: 'template' | 'node' | 'attribute' | 'machine';
    definition: ASTNode;
}

class ModuleScope {
    private exports: Map<string, ExportedSymbol> = new Map();
    private imports: Map<string, ModuleScope> = new Map();

    addExport(symbol: ExportedSymbol) {
        this.exports.set(symbol.name, symbol);
    }

    addImport(alias: string, module: ModuleScope) {
        this.imports.set(alias, module);
    }

    resolve(qualifiedName: string): ExportedSymbol | undefined {
        const parts = qualifiedName.split('.');
        if (parts.length === 1) {
            return this.exports.get(parts[0]);
        }
        const module = this.imports.get(parts[0]);
        return module?.exports.get(parts[1]);
    }
}
```

### 4. Langium Integration

**Grammar Changes:**
```
Machine:
    imports+=ImportStatement*
    'machine' title=STRING '{'
        elements+=Element*
    '}';

ImportStatement:
    'import' (
        path=STRING ('as' alias=ID)? |
        '{' symbols+=ID (',' symbols+=ID)* '}' 'from' path=STRING
    ) ';';
```

**Scoping Service:**
```typescript
export class MachineScope implements ScopeProvider {
    getScope(context: ReferenceInfo): Scope {
        const node = context.container;
        const document = AstUtils.getDocument(node);

        // Include symbols from imported modules
        const importedScopes = this.getImportedScopes(document);
        const localScope = this.getLocalScope(node);

        return this.mergeScopes(localScope, ...importedScopes);
    }

    private getImportedScopes(document: LangiumDocument): Scope[] {
        const machine = document.parseResult.value as Machine;
        return machine.imports.map(imp => this.resolveImport(imp));
    }
}
```

## Playground Integration

### File API Extensions

Add endpoint for resolving imports:

```typescript
// api/files/resolve.ts
export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { file, currentFile, dir } = req.query;

    // Resolve relative paths
    const resolvedPath = resolveImportPath(file, currentFile, dir);

    // Read and return file content
    const content = await readFile(resolvedPath);
    res.json({ path: resolvedPath, content });
}
```

### Multi-File Compilation

Update executor to handle module dependencies:

```typescript
class MultiFileExecutor {
    async compile(entryPoint: string): Promise<CompiledMachine> {
        // 1. Build dependency graph
        const graph = await this.buildDependencyGraph(entryPoint);

        // 2. Check for cycles
        const cycles = graph.detectCycles();
        if (cycles.length > 0) {
            throw new Error(`Circular dependencies detected: ${cycles}`);
        }

        // 3. Compile in topological order
        const order = graph.topologicalSort();
        const modules = new Map<string, CompiledModule>();

        for (const file of order) {
            const module = await this.compileModule(file, modules);
            modules.set(file, module);
        }

        // 4. Link and return entry module
        return this.link(modules.get(entryPoint)!);
    }
}
```

## CLI Integration

### Command Extensions

```bash
# Check imports and dependencies
dygram check myfile.dy --show-deps

# Compile with imports
dygram compile myfile.dy --output dist/

# Server mode with import resolution
dygram server ./machines --watch
```

### Watch Mode

Implement file watching with incremental recompilation:

```typescript
class FileWatcher {
    private dependencyGraph: DependencyGraph;

    watch(entryPoint: string) {
        const watcher = chokidar.watch('**/*.dy');

        watcher.on('change', async (filepath) => {
            // Find all files that depend on changed file
            const affected = this.dependencyGraph.getDependents(filepath);

            // Recompile affected files
            for (const file of affected) {
                await this.recompile(file);
            }
        });
    }
}
```

## Security Considerations

1. **Path Traversal**: Validate import paths to prevent directory traversal attacks
2. **Circular Dependencies**: Detect and prevent infinite loops
3. **Resource Limits**: Limit import depth and file size
4. **Sandboxing**: Consider sandboxing execution environment

## Migration Path

### Phase 1: Basic Imports (Current PR)
- ✅ Multi-file editor with tabs
- ✅ File tree navigation
- ✅ Save functionality
- 📝 Documentation (this file)

### Phase 2: Grammar & Parser
- Add import statements to grammar
- Implement module resolution
- Update Langium scoping service

### Phase 3: Dependency Management
- Build dependency graph
- Implement cycle detection
- Add watch mode support

### Phase 4: Advanced Features
- Package manager integration
- Remote imports (URLs)
- Standard library

## Open Questions

1. **Export Syntax**: Should machines explicitly export symbols, or are all top-level definitions exported by default?
2. **Private Definitions**: Do we need private/internal symbols that cannot be imported?
3. **Version Management**: How to handle version conflicts between imported modules?
4. **Type Checking**: How to validate imported types match usage context?

## References

- Langium Documentation: https://langium.org/docs/
- TypeScript Module Resolution: https://www.typescriptlang.org/docs/handbook/module-resolution.html
- ES6 Modules: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
