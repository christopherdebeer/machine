# Import System Low-Level Design

## Executive Summary

This document provides a comprehensive low-level design for implementing an import/module system in DyGram. It builds upon the high-level design in `IMPORT_SYSTEM_DESIGN.md` and provides detailed implementation specifications accounting for import behavior throughout all language stages (parsing, linking, validation, generation, execution) and execution contexts (CLI and playground).

### Preferred Syntax (Initial Implementation)

```dy
import { nodeX, nameSpace, qualified.subNamespace, typeFoo } from "./lib/core.dygram"
```

### Design Principles

1. **Default Export All**: All top-level definitions are automatically exported (no explicit export syntax)
2. **URL Import Support**: Enable remote imports via HTTP/HTTPS URLs
3. **Backward Compatibility**: Existing single-file machines continue to work without modification
4. **Stage-Aware**: Import resolution integrates seamlessly across all language processing stages
5. **Context-Agnostic**: Identical behavior in CLI and playground environments

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Grammar Specification](#grammar-specification)
3. [Language Stage Integration](#language-stage-integration)
4. [Module Resolution](#module-resolution)
5. [Scope and Symbol Management](#scope-and-symbol-management)
6. [Execution Model](#execution-model)
7. [CLI Integration](#cli-integration)
8. [Playground Integration](#playground-integration)
9. [Error Handling](#error-handling)
10. [Security Considerations](#security-considerations)
11. [Implementation Roadmap](#implementation-roadmap)

---

## Architecture Overview

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Import System                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │   Grammar    │─────▶│  AST Node    │                   │
│  │  Extension   │      │  (Import)    │                   │
│  └──────────────┘      └──────────────┘                   │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │      Module Resolution Layer         │                 │
│  ├──────────────────────────────────────┤                 │
│  │  • FileSystemResolver                │                 │
│  │  • URLResolver                       │                 │
│  │  • VirtualFSResolver (playground)    │                 │
│  │  • Module Cache                      │                 │
│  └──────────────────────────────────────┘                 │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │      Workspace Manager               │                 │
│  ├──────────────────────────────────────┤                 │
│  │  • LangiumDocument per file          │                 │
│  │  • Dependency Graph                  │                 │
│  │  • Cycle Detection                   │                 │
│  │  • Topological Sort                  │                 │
│  └──────────────────────────────────────┘                 │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │      Multi-File Linker               │                 │
│  ├──────────────────────────────────────┤                 │
│  │  • Phase 1: Parse all files          │                 │
│  │  • Phase 2: Resolve imports          │                 │
│  │  • Phase 3: Link cross-file refs     │                 │
│  │  • Phase 4: Link internal refs       │                 │
│  └──────────────────────────────────────┘                 │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │      Extended Scope Provider         │                 │
│  ├──────────────────────────────────────┤                 │
│  │  • Local scope (current file)        │                 │
│  │  • Imported scopes (named imports)   │                 │
│  │  • Qualified access (module.symbol)  │                 │
│  │  • Namespace collision detection     │                 │
│  └──────────────────────────────────────┘                 │
│                              │                              │
│                              ▼                              │
│  ┌──────────────────────────────────────┐                 │
│  │      Machine Merger/Generator        │                 │
│  ├──────────────────────────────────────┤                 │
│  │  • Merge all modules into MachineData│                 │
│  │  • Preserve source file metadata     │                 │
│  │  • Generate unified JSON/Graphviz    │                 │
│  └──────────────────────────────────────┘                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Langium Workspace Integration**: Leverage Langium's built-in `WorkspaceManager` for multi-document support
2. **Selective Import Syntax**: Use ES6-style named imports with destructuring syntax
3. **Flat Symbol Space**: All imported symbols merge into a flat namespace within the importing file
4. **No Re-export**: Initial implementation does not support re-exporting imported symbols
5. **Relative & URL Paths**: Support both filesystem-relative paths (`./`, `../`) and absolute URLs
6. **Cache-First**: Implement module caching to avoid redundant parsing and resolution

---

## Grammar Specification

### Langium Grammar Extension

**File**: `src/language/machine.langium`

```langium
entry Machine:
    imports+=ImportStatement*
    ('machine' title=STRING (annotations+=Annotation)* (('{'
        (attributes+=Attribute<false>)*
    '}' ';'?) | ';'?))?
    (edges+=Edge<true> | nodes+=Node<true> | attributes+=Attribute<true>)*
;

ImportStatement:
    'import' '{' symbols+=ImportedSymbol (',' symbols+=ImportedSymbol)* '}' 'from' path=STRING ';'?
;

ImportedSymbol:
    name=QualifiedName ('as' alias=ID)?
;
```

### Grammar Changes Explained

1. **ImportStatement**: New top-level rule for import declarations
   - Must appear before machine definition
   - Supports multiple imports per statement
   - Path is a STRING terminal (supports quotes for spaces/special chars)
   - Semicolon is optional (consistent with existing syntax flexibility)

2. **ImportedSymbol**: Represents each imported symbol
   - `name` uses `QualifiedName` to support `qualified.subNamespace` syntax
   - Optional `as` clause for aliasing to avoid naming conflicts
   - Examples:
     - `nodeX` → imports as `nodeX`
     - `qualified.subNamespace` → imports as `subNamespace` (short name) unless aliased
     - `typeFoo as MyType` → imports as `MyType`

3. **QualifiedName**: Already exists in grammar (line 57-59)
   - Supports dot-separated identifiers: `ID ('.' ID)*`
   - Used for both import specifiers and node references

### Generated AST Types

```typescript
// Auto-generated in src/language/generated/ast.ts

export interface Machine extends AstNode {
  $type: 'Machine';
  imports: ImportStatement[];
  title?: string;
  annotations?: Annotation[];
  attributes?: Attribute[];
  nodes: Node[];
  edges: Edge[];
}

export interface ImportStatement extends AstNode {
  $type: 'ImportStatement';
  symbols: ImportedSymbol[];
  path: string;
}

export interface ImportedSymbol extends AstNode {
  $type: 'ImportedSymbol';
  name: string;  // Qualified name like "nodeX" or "ns.symbol"
  alias?: string;
}
```

### Example Usage

```dy
// Import individual symbols
import { LoginTask, AuthContext } from "./auth.dygram"

// Import with qualified names
import { workflows.auth, workflows.payment } from "./workflows.dygram"

// Import with aliasing to avoid conflicts
import { start as authStart, end as authEnd } from "./auth.dygram"

// Import from URL
import { HttpClient, JsonParser } from "https://stdlib.dygram.io/http/v1.dygram"

// Multiple imports
import { A, B, C } from "./file1.dygram"
import { X, Y, Z } from "./file2.dygram"

machine "MyApp" {
  // Use imported symbols directly
  start -> LoginTask -> AuthContext -> end;
}
```

---

## Language Stage Integration

DyGram processes code through 5 distinct stages. The import system must integrate at each stage:

### Stage 1: Parsing

**Input**: Source text with import statements
**Output**: AST with `ImportStatement` nodes
**Location**: Langium parser (auto-generated)

**Changes Required**:
- ✅ Grammar extension (see above) - triggers parser regeneration
- No additional code changes needed

**Behavior**:
```typescript
// Before: Single file parse
const document = await parseDocument(sourceText);

// After: Single file parse (unchanged API)
const document = await parseDocument(sourceText);
// AST now includes imports[] array
```

### Stage 2: Linking

**Input**: AST with unresolved imports
**Output**: Linked AST with resolved cross-file references
**Location**: `src/language/machine-linker.ts`

**Changes Required**: Major refactoring to support multi-document linking

**New Components**:

1. **WorkspaceManager**: Manages multiple documents
2. **ImportResolver**: Resolves import paths and loads modules
3. **DependencyGraph**: Tracks inter-file dependencies
4. **Multi-Phase Linker**: Extends `MachineLinker`

**Implementation**:

```typescript
// src/language/workspace-manager.ts
export class MachineWorkspaceManager {
  private documents = new Map<string, LangiumDocument>();
  private resolver: ImportResolver;
  private dependencyGraph = new DependencyGraph();

  constructor(services: MachineServices, resolver: ImportResolver) {
    this.resolver = resolver;
  }

  async loadDocument(uri: string, entryPoint: boolean = false): Promise<LangiumDocument> {
    // Check cache
    if (this.documents.has(uri)) {
      return this.documents.get(uri)!;
    }

    // Load and parse document
    const content = await this.resolver.load(uri);
    const document = await this.parseDocument(uri, content);
    this.documents.set(uri, document);

    // Process imports recursively
    const machine = document.parseResult.value as Machine;
    if (machine.imports) {
      for (const importStmt of machine.imports) {
        const resolvedPath = await this.resolver.resolve(importStmt.path, uri);

        // Track dependency
        this.dependencyGraph.addEdge(uri, resolvedPath);

        // Load imported document (recursive)
        await this.loadDocument(resolvedPath, false);
      }
    }

    return document;
  }

  async linkAll(entryPointUri: string): Promise<void> {
    // 1. Load all documents (recursive)
    await this.loadDocument(entryPointUri, true);

    // 2. Check for circular dependencies
    const cycles = this.dependencyGraph.detectCycles();
    if (cycles.length > 0) {
      throw new ImportCycleError(cycles);
    }

    // 3. Get linking order (topological sort)
    const linkingOrder = this.dependencyGraph.topologicalSort();

    // 4. Link in dependency order
    for (const uri of linkingOrder) {
      const document = this.documents.get(uri)!;
      await this.linkDocument(document);
    }
  }

  private async linkDocument(document: LangiumDocument): Promise<void> {
    // Extended MachineLinker that knows about imported scopes
    const linker = new MultiFileMachineLinker(this);
    await linker.link(document);
  }
}
```

```typescript
// src/language/dependency-graph.ts
export class DependencyGraph {
  private edges = new Map<string, Set<string>>();

  addEdge(from: string, to: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    this.edges.get(from)!.add(to);
  }

  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      if (stack.has(node)) {
        // Found a cycle
        const cycleStart = path.indexOf(node);
        cycles.push(path.slice(cycleStart).concat(node));
        return;
      }
      if (visited.has(node)) {
        return;
      }

      visited.add(node);
      stack.add(node);
      path.push(node);

      const neighbors = this.edges.get(node) || new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor, [...path]);
      }

      stack.delete(node);
    };

    for (const node of this.edges.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  topologicalSort(): string[] {
    const visited = new Set<string>();
    const stack: string[] = [];

    const dfs = (node: string): void => {
      if (visited.has(node)) {
        return;
      }
      visited.add(node);

      const neighbors = this.edges.get(node) || new Set();
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }

      stack.push(node);
    };

    // Visit all nodes (including those without outgoing edges)
    const allNodes = new Set<string>();
    for (const [from, tos] of this.edges) {
      allNodes.add(from);
      for (const to of tos) {
        allNodes.add(to);
      }
    }

    for (const node of allNodes) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return stack.reverse(); // Reverse post-order
  }

  getDependents(uri: string): string[] {
    // Find all nodes that depend on uri (for incremental recompilation)
    const dependents: string[] = [];
    for (const [from, tos] of this.edges) {
      if (tos.has(uri)) {
        dependents.push(from);
      }
    }
    return dependents;
  }
}
```

```typescript
// src/language/multi-file-machine-linker.ts
export class MultiFileMachineLinker extends MachineLinker {
  constructor(
    services: MachineServices,
    private workspace: MachineWorkspaceManager
  ) {
    super(services);
  }

  override async link(document: LangiumDocument): Promise<void> {
    const machine = document.parseResult.value as Machine;

    // Phase 1: Expand qualified names in node definitions (existing logic)
    if (isMachine(machine)) {
      const expander = new QualifiedNameExpander();
      expander.expandQualifiedNames(machine);

      const isStrict = this.isStrictMode(machine);

      this.processNoteNodes(machine);

      if (!isStrict) {
        this.autoCreateMissingNodes(machine);
      }
    }

    // Phase 2: Build import scope map
    await this.buildImportScopes(machine, document.uri.toString());

    // Phase 3: Perform linking with extended scope
    return super.link(document);
  }

  private async buildImportScopes(machine: Machine, currentUri: string): Promise<void> {
    for (const importStmt of machine.imports) {
      const resolvedUri = await this.workspace.resolver.resolve(
        importStmt.path,
        currentUri
      );

      const importedDoc = this.workspace.documents.get(resolvedUri);
      if (!importedDoc) {
        // Should not happen if workspace loaded correctly
        throw new Error(`Import not found: ${importStmt.path}`);
      }

      const importedMachine = importedDoc.parseResult.value as Machine;

      // Register imported symbols in scope
      for (const symbol of importStmt.symbols) {
        this.registerImportedSymbol(machine, importedMachine, symbol);
      }
    }
  }

  private registerImportedSymbol(
    targetMachine: Machine,
    sourceMachine: Machine,
    symbol: ImportedSymbol
  ): void {
    // Find the node in sourceMachine matching symbol.name
    const sourceNode = this.findNodeByQualifiedName(sourceMachine, symbol.name);

    if (!sourceNode) {
      // Error: imported symbol not found
      // Will be reported in validation stage
      return;
    }

    // Determine the local name in target machine
    const localName = symbol.alias || this.getShortName(symbol.name);

    // Clone the node and add to target machine
    // (Alternative: keep reference and update scope provider)
    const clonedNode = this.cloneNode(sourceNode);
    clonedNode.name = localName;

    // Mark as imported for metadata tracking
    if (!clonedNode.annotations) {
      clonedNode.annotations = [];
    }
    clonedNode.annotations.push({
      $type: 'Annotation',
      name: 'Imported',
      value: symbol.name
    } as Annotation);

    targetMachine.nodes.push(clonedNode);
  }

  private findNodeByQualifiedName(machine: Machine, qualifiedName: string): Node | undefined {
    const parts = qualifiedName.split('.');

    // Recursive search through nested nodes
    const search = (nodes: Node[], pathParts: string[]): Node | undefined => {
      if (pathParts.length === 0) {
        return undefined;
      }

      const [first, ...rest] = pathParts;

      for (const node of nodes) {
        // Check if node name matches (considering qualified names in definitions)
        const nodeParts = node.name.split('.');
        const nodeSimpleName = nodeParts[nodeParts.length - 1];

        if (nodeSimpleName === first || node.name === first) {
          if (rest.length === 0) {
            // Found it
            return node;
          } else {
            // Continue searching in nested nodes
            return search(node.nodes || [], rest);
          }
        }
      }

      return undefined;
    };

    return search(machine.nodes, parts);
  }

  private getShortName(qualifiedName: string): string {
    const parts = qualifiedName.split('.');
    return parts[parts.length - 1];
  }

  private cloneNode(node: Node): Node {
    // Deep clone node and all nested structure
    // Use structuredClone or custom deep clone
    return JSON.parse(JSON.stringify(node)) as Node;
  }
}
```

**Behavior**:
```typescript
// Usage in CLI or playground
const workspace = new MachineWorkspaceManager(services, resolver);
await workspace.linkAll('file:///path/to/main.dygram');

// All documents are now parsed, linked, and ready for validation
```

### Stage 3: Validation

**Input**: Linked AST with resolved imports
**Output**: Diagnostics (errors/warnings)
**Location**: `src/language/machine-validator.ts`, `src/language/machine-type-checker.ts`, `src/language/graph-validator.ts`

**Changes Required**: Add import-specific validations

**New Validations**:

```typescript
// src/language/import-validator.ts
export class ImportValidator {

  async validateImports(machine: Machine, document: LangiumDocument): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];

    for (const importStmt of machine.imports) {
      // 1. Validate import path syntax
      if (!this.isValidPath(importStmt.path)) {
        diagnostics.push({
          severity: 'error',
          message: `Invalid import path: ${importStmt.path}`,
          range: getRange(importStmt.$cstNode)
        });
      }

      // 2. Check for duplicate imports
      const importedPaths = machine.imports.map(i => i.path);
      const duplicates = importedPaths.filter((p, i) => importedPaths.indexOf(p) !== i);
      if (duplicates.includes(importStmt.path)) {
        diagnostics.push({
          severity: 'warning',
          message: `Duplicate import: ${importStmt.path}`,
          range: getRange(importStmt.$cstNode)
        });
      }

      // 3. Validate imported symbols exist
      for (const symbol of importStmt.symbols) {
        const resolvedUri = await resolver.resolve(importStmt.path, document.uri);
        const importedDoc = workspace.documents.get(resolvedUri);

        if (importedDoc) {
          const importedMachine = importedDoc.parseResult.value as Machine;
          const found = this.findSymbol(importedMachine, symbol.name);

          if (!found) {
            diagnostics.push({
              severity: 'error',
              message: `Symbol '${symbol.name}' not found in ${importStmt.path}`,
              range: getRange(symbol.$cstNode)
            });
          }
        }
      }

      // 4. Check for naming conflicts
      const localNames = new Map<string, ImportedSymbol>();
      for (const symbol of importStmt.symbols) {
        const localName = symbol.alias || this.getShortName(symbol.name);

        if (localNames.has(localName)) {
          diagnostics.push({
            severity: 'error',
            message: `Naming conflict: '${localName}' imported multiple times`,
            range: getRange(symbol.$cstNode)
          });
        }

        localNames.set(localName, symbol);
      }

      // 5. Check for conflicts with local definitions
      for (const node of machine.nodes) {
        const nodeName = this.getShortName(node.name);
        if (localNames.has(nodeName)) {
          diagnostics.push({
            severity: 'error',
            message: `Name '${nodeName}' conflicts with imported symbol`,
            range: getRange(node.$cstNode)
          });
        }
      }
    }

    return diagnostics;
  }

  private isValidPath(path: string): boolean {
    // Check for valid relative path or URL
    return (
      path.startsWith('./') ||
      path.startsWith('../') ||
      path.startsWith('http://') ||
      path.startsWith('https://') ||
      path.startsWith('/')
    );
  }

  private findSymbol(machine: Machine, qualifiedName: string): Node | undefined {
    // Same logic as MultiFileMachineLinker.findNodeByQualifiedName
    // (could be extracted to shared utility)
    // ...
  }

  private getShortName(qualifiedName: string): string {
    return qualifiedName.split('.').pop()!;
  }
}
```

**Integration with MachineValidator**:

```typescript
// src/language/machine-validator.ts (extend existing)
@ValidationChecks('Machine')
export class MachineValidator {
  private importValidator = new ImportValidator();

  @Check('Machine')
  checkMachine(machine: Machine, acceptor: ValidationAcceptor): void {
    // Existing validations...

    // Add import validations
    const diagnostics = this.importValidator.validateImports(machine, getDocument(machine));
    diagnostics.forEach(d => acceptor(d.severity, d.message, d.range));
  }
}
```

**Behavior**:
- Import path not found → Error
- Imported symbol not found → Error
- Naming conflict → Error
- Circular dependency → Error (detected in linking stage)
- Duplicate imports → Warning

### Stage 4: Generation

**Input**: Validated multi-file AST
**Output**: Unified MachineData (JSON), Graphviz, HTML
**Location**: `src/language/generator/generator.ts`

**Changes Required**: Merge multiple machines into single output

**Implementation**:

```typescript
// src/language/generator/multi-file-generator.ts
export class MultiFileGenerator extends Generator {

  async generateMachineData(
    entryDocument: LangiumDocument,
    workspace: MachineWorkspaceManager
  ): Promise<MachineData> {

    // Collect all machines in dependency order
    const machines: Array<{ uri: string; machine: Machine }> = [];
    const linkingOrder = workspace.dependencyGraph.topologicalSort();

    for (const uri of linkingOrder) {
      const doc = workspace.documents.get(uri)!;
      const machine = doc.parseResult.value as Machine;
      machines.push({ uri, machine });
    }

    // Merge all machines into entry machine
    const entryMachine = entryDocument.parseResult.value as Machine;
    const mergedMachine = this.mergeMachines(entryMachine, machines);

    // Generate MachineData from merged machine (existing logic)
    return super.generateMachineData(mergedMachine);
  }

  private mergeMachines(
    entry: Machine,
    allMachines: Array<{ uri: string; machine: Machine }>
  ): Machine {

    // Strategy: Entry machine is the base
    // All imported nodes are already cloned into entry machine during linking
    // So no additional merge needed!

    // However, we need to preserve metadata about source files
    this.annotateSourceFiles(entry, allMachines);

    return entry;
  }

  private annotateSourceFiles(
    machine: Machine,
    allMachines: Array<{ uri: string; machine: Machine }>
  ): void {

    // Add @SourceFile annotation to each node indicating origin
    const uriToFile = new Map(allMachines.map(({ uri, machine }) => [uri, uri]));

    const annotate = (node: Node, sourceUri?: string) => {
      if (sourceUri) {
        if (!node.annotations) {
          node.annotations = [];
        }

        // Check if already has @Imported annotation (from import)
        const imported = node.annotations.find(a => a.name === 'Imported');
        if (imported) {
          // This node was imported - find its source
          // (already tracked during linking)
        } else {
          // Local node - annotate with current file
          node.annotations.push({
            $type: 'Annotation',
            name: 'SourceFile',
            value: sourceUri
          } as Annotation);
        }
      }

      // Recurse
      for (const child of node.nodes || []) {
        annotate(child, sourceUri);
      }
    };

    // Annotate all nodes in entry machine
    for (const node of machine.nodes) {
      annotate(node, allMachines.find(m => m.machine === machine)?.uri);
    }
  }
}
```

**Behavior**:
```typescript
const generator = new MultiFileGenerator();
const machineData = await generator.generateMachineData(entryDoc, workspace);

// machineData is a unified structure with all imported nodes
// Source file information is preserved in annotations
```

**Output Example**:

```json
{
  "title": "MyApp",
  "nodes": [
    {
      "name": "start",
      "type": "init",
      "annotations": [
        { "name": "SourceFile", "value": "file:///main.dygram" }
      ]
    },
    {
      "name": "LoginTask",
      "type": "task",
      "annotations": [
        { "name": "Imported", "value": "LoginTask" },
        { "name": "SourceFile", "value": "file:///auth.dygram" }
      ],
      "attributes": [...]
    },
    ...
  ],
  "edges": [...]
}
```

### Stage 5: Execution

**Input**: Unified MachineData (from generation)
**Output**: Execution context with history
**Location**: `src/language/rails-executor.ts`

**Changes Required**: Minimal - executor already works with MachineData

**Behavior**:
- Executor receives merged MachineData (no import information)
- All imported nodes appear as regular nodes
- Execution proceeds identically to single-file machines
- Source file annotations can be used for debugging/tracing

**Enhancement** (optional):

```typescript
// src/language/rails-executor.ts (optional enhancement)
export class RailsExecutor {

  private getNodeSourceFile(nodeName: string): string | undefined {
    const node = this.machineData.nodes.find(n => n.name === nodeName);
    const sourceAnnotation = node?.annotations?.find(a => a.name === 'SourceFile');
    return sourceAnnotation?.value as string | undefined;
  }

  async executeNode(nodeName: string): Promise<ExecutionResult> {
    const sourceFile = this.getNodeSourceFile(nodeName);

    // Include source file in execution context for debugging
    this.context.history.push({
      from: this.context.currentNode,
      to: nodeName,
      sourceFile: sourceFile,
      timestamp: new Date().toISOString()
    });

    // Rest of execution logic unchanged
    // ...
  }
}
```

---

## Module Resolution

The module resolution layer is responsible for locating and loading imported files. It must support multiple environments and protocols.

### Resolver Interface

```typescript
// src/language/import-resolver.ts
export interface ImportResolver {
  /**
   * Resolve an import path to an absolute URI
   * @param importPath - The path from the import statement
   * @param currentFileUri - The URI of the file containing the import
   * @returns Absolute URI of the imported file
   */
  resolve(importPath: string, currentFileUri: string): Promise<string>;

  /**
   * Load the content of a resolved module
   * @param resolvedUri - Absolute URI from resolve()
   * @returns Module content as string
   */
  load(resolvedUri: string): Promise<string>;
}
```

### FileSystem Resolver (CLI)

```typescript
// src/language/resolvers/filesystem-resolver.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath, pathToFileURL } from 'url';

export class FileSystemResolver implements ImportResolver {
  constructor(private workingDir: string) {}

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    // Remove quotes if present
    const cleanPath = importPath.replace(/^["']|["']$/g, '');

    // Handle URL imports
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      return cleanPath;
    }

    // Convert current file URI to path
    const currentFilePath = fileURLToPath(currentFileUri);
    const currentDir = path.dirname(currentFilePath);

    let resolvedPath: string;

    if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
      // Relative to current file
      resolvedPath = path.resolve(currentDir, cleanPath);
    } else if (cleanPath.startsWith('/')) {
      // Absolute path
      resolvedPath = cleanPath;
    } else {
      // Relative to working directory
      resolvedPath = path.resolve(this.workingDir, cleanPath);
    }

    // Ensure .dygram extension
    if (!resolvedPath.endsWith('.dygram')) {
      resolvedPath += '.dygram';
    }

    // Check file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      throw new ModuleNotFoundError(
        `Cannot find module '${importPath}' from '${currentFileUri}'`
      );
    }

    // Convert back to file:// URI
    return pathToFileURL(resolvedPath).toString();
  }

  async load(resolvedUri: string): Promise<string> {
    if (resolvedUri.startsWith('http')) {
      // Delegate to URL resolver
      const urlResolver = new URLResolver();
      return urlResolver.load(resolvedUri);
    }

    const filePath = fileURLToPath(resolvedUri);
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new ModuleLoadError(
        `Failed to load module '${resolvedUri}': ${error}`
      );
    }
  }
}
```

### URL Resolver (Remote Imports)

```typescript
// src/language/resolvers/url-resolver.ts
import fetch from 'node-fetch';

export class URLResolver implements ImportResolver {
  private cache = new Map<string, string>();
  private readonly timeout = 10000; // 10s timeout

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    const cleanPath = importPath.replace(/^["']|["']$/g, '');

    // If import is relative and current file is a URL, resolve relative to it
    if ((cleanPath.startsWith('./') || cleanPath.startsWith('../')) &&
        currentFileUri.startsWith('http')) {
      const currentUrl = new URL(currentFileUri);
      const resolvedUrl = new URL(cleanPath, currentUrl);
      return resolvedUrl.toString();
    }

    // Otherwise, must be absolute URL
    if (!cleanPath.startsWith('http://') && !cleanPath.startsWith('https://')) {
      throw new ModuleResolutionError(
        `Invalid URL import: ${importPath}`
      );
    }

    return cleanPath;
  }

  async load(resolvedUri: string): Promise<string> {
    // Check cache
    if (this.cache.has(resolvedUri)) {
      return this.cache.get(resolvedUri)!;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(resolvedUri, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'DyGram/1.0',
          'Accept': 'text/plain, application/octet-stream'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = await response.text();

      // Cache the result
      this.cache.set(resolvedUri, content);

      return content;
    } catch (error) {
      throw new ModuleLoadError(
        `Failed to fetch module '${resolvedUri}': ${error}`
      );
    }
  }
}
```

### Virtual FileSystem Resolver (Playground)

```typescript
// src/language/resolvers/virtual-fs-resolver.ts
export interface VirtualFileSystem {
  readFile(path: string): string | undefined;
  writeFile(path: string, content: string): void;
  exists(path: string): boolean;
}

export class VirtualFSResolver implements ImportResolver {
  constructor(
    private vfs: VirtualFileSystem,
    private currentDirectory: string = '/'
  ) {}

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    const cleanPath = importPath.replace(/^["']|["']$/g, '');

    // Handle URL imports (delegate to URL resolver)
    if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
      return cleanPath;
    }

    // Parse current file URI (format: vfs:///path/to/file.dygram)
    const currentPath = currentFileUri.replace('vfs://', '');
    const currentDir = this.getDirectory(currentPath);

    let resolvedPath: string;

    if (cleanPath.startsWith('./') || cleanPath.startsWith('../')) {
      // Relative to current file
      resolvedPath = this.resolvePath(currentDir, cleanPath);
    } else if (cleanPath.startsWith('/')) {
      // Absolute path in VFS
      resolvedPath = cleanPath;
    } else {
      // Relative to current directory
      resolvedPath = this.resolvePath(this.currentDirectory, cleanPath);
    }

    // Ensure .dygram extension
    if (!resolvedPath.endsWith('.dygram')) {
      resolvedPath += '.dygram';
    }

    // Check if file exists in VFS
    if (!this.vfs.exists(resolvedPath)) {
      throw new ModuleNotFoundError(
        `Cannot find module '${importPath}' (resolved to '${resolvedPath}')`
      );
    }

    return `vfs://${resolvedPath}`;
  }

  async load(resolvedUri: string): Promise<string> {
    // Handle URL imports
    if (resolvedUri.startsWith('http')) {
      const urlResolver = new URLResolver();
      return urlResolver.load(resolvedUri);
    }

    const path = resolvedUri.replace('vfs://', '');
    const content = this.vfs.readFile(path);

    if (content === undefined) {
      throw new ModuleLoadError(`Module not found: ${resolvedUri}`);
    }

    return content;
  }

  private getDirectory(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/') || '/';
  }

  private resolvePath(basePath: string, relativePath: string): string {
    const parts = basePath.split('/').filter(p => p);
    const relParts = relativePath.split('/').filter(p => p);

    for (const part of relParts) {
      if (part === '..') {
        parts.pop();
      } else if (part !== '.') {
        parts.push(part);
      }
    }

    return '/' + parts.join('/');
  }
}
```

### Composite Resolver

```typescript
// src/language/resolvers/composite-resolver.ts
export class CompositeResolver implements ImportResolver {
  private resolvers: ImportResolver[] = [];

  addResolver(resolver: ImportResolver): void {
    this.resolvers.push(resolver);
  }

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    for (const resolver of this.resolvers) {
      try {
        return await resolver.resolve(importPath, currentFileUri);
      } catch (error) {
        // Try next resolver
        continue;
      }
    }

    throw new ModuleNotFoundError(
      `No resolver could handle import '${importPath}'`
    );
  }

  async load(resolvedUri: string): Promise<string> {
    for (const resolver of this.resolvers) {
      try {
        return await resolver.load(resolvedUri);
      } catch (error) {
        // Try next resolver
        continue;
      }
    }

    throw new ModuleLoadError(`No resolver could load '${resolvedUri}'`);
  }
}
```

### Error Classes

```typescript
// src/language/import-errors.ts
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export class ModuleNotFoundError extends ImportError {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleNotFoundError';
  }
}

export class ModuleLoadError extends ImportError {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleLoadError';
  }
}

export class ModuleResolutionError extends ImportError {
  constructor(message: string) {
    super(message);
    this.name = 'ModuleResolutionError';
  }
}

export class ImportCycleError extends ImportError {
  constructor(public cycles: string[][]) {
    const cycleStr = cycles.map(c => c.join(' -> ')).join('\n');
    super(`Circular dependency detected:\n${cycleStr}`);
    this.name = 'ImportCycleError';
  }
}
```

---

## Scope and Symbol Management

The scope provider must be extended to handle imported symbols and cross-file references.

### Extended Scope Provider

```typescript
// src/language/multi-file-scope-provider.ts
export class MultiFileScopeProvider extends MachineScopeProvider {
  constructor(
    services: MachineServices,
    private workspace: MachineWorkspaceManager
  ) {
    super(services);
  }

  override getScope(context: ReferenceInfo): Scope {
    // Get local scope (existing logic)
    const localScope = super.getScope(context);

    // For node references, include imported symbols
    if (context.property === 'source' || context.property === 'target') {
      const machine = this.getMachineContainer(context.container);
      if (machine) {
        const importedScope = this.getImportedScope(machine, context);
        return this.mergeScopes(localScope, importedScope);
      }
    }

    return localScope;
  }

  private getImportedScope(machine: Machine, context: ReferenceInfo): Scope {
    const descriptions: AstNodeDescription[] = [];

    // Imported nodes are already cloned into machine.nodes during linking
    // So they're already in local scope!
    // However, we need to handle qualified access (module.symbol)

    // No additional work needed for flat imports
    // For future module prefix support: would add module-qualified names here

    return this.createScope(stream(descriptions));
  }

  private mergeScopes(...scopes: Scope[]): Scope {
    // Merge multiple scopes with precedence (first scope wins on conflicts)
    const allDescriptions: AstNodeDescription[] = [];
    const seenNames = new Set<string>();

    for (const scope of scopes) {
      const descriptions = stream(scope.getAllElements()).toArray();
      for (const desc of descriptions) {
        if (!seenNames.has(desc.name)) {
          allDescriptions.push(desc);
          seenNames.add(desc.name);
        }
      }
    }

    return this.createScope(stream(allDescriptions));
  }
}
```

### Symbol Table (Future Extension)

For more advanced features (e.g., module prefixes, re-exports), a dedicated symbol table may be needed:

```typescript
// src/language/symbol-table.ts (future extension)
export interface Symbol {
  name: string;
  type: 'node' | 'attribute' | 'type';
  node: AstNode;
  sourceFile: string;
  exported: boolean;
}

export class SymbolTable {
  private symbols = new Map<string, Symbol>();

  addSymbol(symbol: Symbol): void {
    this.symbols.set(symbol.name, symbol);
  }

  getSymbol(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }

  getAllSymbols(): Symbol[] {
    return Array.from(this.symbols.values());
  }

  getExportedSymbols(): Symbol[] {
    return this.getAllSymbols().filter(s => s.exported);
  }
}

export class ModuleSymbolTable {
  private modules = new Map<string, SymbolTable>();

  addModule(uri: string, table: SymbolTable): void {
    this.modules.set(uri, table);
  }

  getModule(uri: string): SymbolTable | undefined {
    return this.modules.get(uri);
  }

  resolveQualifiedName(name: string, currentModule: string): Symbol | undefined {
    // For qualified names like "moduleX.symbolY"
    // Would require module alias tracking
    // Not needed for initial flat import implementation
    return undefined;
  }
}
```

---

## Execution Model

The execution model remains largely unchanged, as the executor operates on unified `MachineData`.

### Execution with Imports

```typescript
// Example: Executing a multi-file machine
const services = createMachineServices();
const resolver = new FileSystemResolver(process.cwd());
const workspace = new MachineWorkspaceManager(services, resolver);

// Load and link all files
await workspace.linkAll('file:///path/to/main.dygram');

// Generate unified MachineData
const generator = new MultiFileGenerator();
const entryDoc = workspace.documents.get('file:///path/to/main.dygram')!;
const machineData = await generator.generateMachineData(entryDoc, workspace);

// Execute (existing code)
const executor = new RailsExecutor(machineData, client, options);
const result = await executor.execute();
```

### Source Tracking in Execution

To provide better debugging and error messages, execution can track source files:

```typescript
// Enhanced execution history
interface ExecutionHistoryEntry {
  from: string;
  to: string;
  transition: string;
  timestamp: string;
  output?: string;
  sourceFile?: string;  // NEW: Track which file the node came from
}

// In RailsExecutor
async executeNode(nodeName: string): Promise<ExecutionResult> {
  const node = this.machineData.nodes.find(n => n.name === nodeName);
  const sourceFile = node?.annotations
    ?.find(a => a.name === 'SourceFile')
    ?.value as string | undefined;

  this.context.history.push({
    from: this.context.currentNode,
    to: nodeName,
    transition: 'some-transition',
    timestamp: new Date().toISOString(),
    sourceFile: sourceFile
  });

  // Rest of execution...
}
```

---

## CLI Integration

The CLI must support import resolution and multi-file operations.

### Command Enhancements

```typescript
// src/cli/main.ts (enhanced commands)

// 1. Generate command - auto-discover imports
cli.command('generate <file>')
  .alias('g')
  .option('-f, --format <formats>', 'Output formats', 'json')
  .option('--no-imports', 'Disable import resolution')
  .action(async (file, options) => {
    const services = createMachineServices();
    const resolver = new FileSystemResolver(process.cwd());

    if (options.imports !== false) {
      // Multi-file mode
      const workspace = new MachineWorkspaceManager(services, resolver);
      await workspace.linkAll(pathToFileURL(file).toString());

      const entryDoc = workspace.documents.get(pathToFileURL(file).toString())!;
      const generator = new MultiFileGenerator();
      const machineData = await generator.generateMachineData(entryDoc, workspace);

      // Output based on format
      await outputFormats(machineData, options.format);
    } else {
      // Single-file mode (existing code)
      const document = await loadDocument(file, services);
      const machineData = await generate(document);
      await outputFormats(machineData, options.format);
    }
  });

// 2. Execute command - auto-discover imports
cli.command('execute <file>')
  .alias('e')
  .option('-m, --model <model>', 'LLM model')
  .action(async (file, options) => {
    const services = createMachineServices();
    const resolver = new FileSystemResolver(process.cwd());
    const workspace = new MachineWorkspaceManager(services, resolver);

    await workspace.linkAll(pathToFileURL(file).toString());

    const entryDoc = workspace.documents.get(pathToFileURL(file).toString())!;
    const generator = new MultiFileGenerator();
    const machineData = await generator.generateMachineData(entryDoc, workspace);

    const client = new AnthropicClient(options.model);
    const executor = new RailsExecutor(machineData, client);
    await executor.execute();
  });

// 3. New: Check imports command
cli.command('check-imports <file>')
  .description('Validate imports and show dependency graph')
  .action(async (file) => {
    const services = createMachineServices();
    const resolver = new FileSystemResolver(process.cwd());
    const workspace = new MachineWorkspaceManager(services, resolver);

    try {
      await workspace.linkAll(pathToFileURL(file).toString());

      console.log('✓ All imports resolved successfully\n');

      // Show dependency graph
      console.log('Dependency Graph:');
      const graph = workspace.dependencyGraph;
      const order = graph.topologicalSort();
      order.forEach((uri, i) => {
        console.log(`  ${i + 1}. ${fileURLToPath(uri)}`);
      });

    } catch (error) {
      if (error instanceof ImportCycleError) {
        console.error('✗ Circular dependency detected:');
        error.cycles.forEach(cycle => {
          console.error('  ' + cycle.map(fileURLToPath).join(' → '));
        });
        process.exit(1);
      } else if (error instanceof ModuleNotFoundError) {
        console.error(`✗ ${error.message}`);
        process.exit(1);
      } else {
        throw error;
      }
    }
  });

// 4. New: Bundle command (generate single-file output)
cli.command('bundle <file>')
  .option('-o, --output <file>', 'Output file')
  .description('Bundle multi-file machine into single file')
  .action(async (file, options) => {
    const services = createMachineServices();
    const resolver = new FileSystemResolver(process.cwd());
    const workspace = new MachineWorkspaceManager(services, resolver);

    await workspace.linkAll(pathToFileURL(file).toString());

    const entryDoc = workspace.documents.get(pathToFileURL(file).toString())!;
    const generator = new MultiFileGenerator();
    const machineData = await generator.generateMachineData(entryDoc, workspace);

    // Reverse-compile to DSL (existing feature)
    const bundledDsl = await generator.generateDSL(machineData);

    const outputFile = options.output || file.replace('.dygram', '.bundled.dygram');
    await fs.writeFile(outputFile, bundledDsl);
    console.log(`✓ Bundled to ${outputFile}`);
  });
```

### Watch Mode with Imports

```typescript
// src/cli/watch-mode.ts
import chokidar from 'chokidar';

export class WatchMode {
  private workspace: MachineWorkspaceManager;
  private watcher?: chokidar.FSWatcher;

  constructor(workspace: MachineWorkspaceManager) {
    this.workspace = workspace;
  }

  async watch(entryFile: string): Promise<void> {
    // Initial load
    const entryUri = pathToFileURL(entryFile).toString();
    await this.workspace.linkAll(entryUri);

    // Get all files in dependency graph
    const allFiles = Array.from(this.workspace.documents.keys())
      .map(uri => fileURLToPath(uri));

    console.log(`Watching ${allFiles.length} files for changes...`);

    // Watch all files
    this.watcher = chokidar.watch(allFiles, {
      persistent: true,
      ignoreInitial: true
    });

    this.watcher.on('change', async (filepath) => {
      console.log(`\n${filepath} changed, recompiling...`);

      try {
        // Find all dependents of changed file
        const changedUri = pathToFileURL(filepath).toString();
        const dependents = this.workspace.dependencyGraph.getDependents(changedUri);

        // Invalidate cache for changed file and dependents
        this.workspace.documents.delete(changedUri);
        dependents.forEach(uri => this.workspace.documents.delete(uri));

        // Reload from entry point
        await this.workspace.linkAll(entryUri);

        console.log('✓ Recompilation successful');
      } catch (error) {
        console.error('✗ Recompilation failed:', error);
      }
    });
  }

  stop(): void {
    this.watcher?.close();
  }
}
```

---

## Playground Integration

The playground requires a virtual filesystem and special handling for browser environments.

### Virtual FileSystem Implementation

```typescript
// src/playground/virtual-filesystem.ts
export class VirtualFileSystem {
  private files = new Map<string, string>();

  readFile(path: string): string | undefined {
    return this.files.get(path);
  }

  writeFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  deleteFile(path: string): boolean {
    return this.files.delete(path);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  listFiles(directory: string = '/'): string[] {
    const files: string[] = [];
    const normalizedDir = directory.endsWith('/') ? directory : directory + '/';

    for (const path of this.files.keys()) {
      if (path.startsWith(normalizedDir)) {
        const relativePath = path.slice(normalizedDir.length);
        if (!relativePath.includes('/')) {
          // Direct child (not in subdirectory)
          files.push(path);
        }
      }
    }

    return files.sort();
  }

  getAllFiles(): Array<{ path: string; content: string }> {
    return Array.from(this.files.entries()).map(([path, content]) => ({
      path,
      content
    }));
  }

  clear(): void {
    this.files.clear();
  }

  // Persistence
  saveToLocalStorage(key: string = 'dygram-vfs'): void {
    const data = JSON.stringify(Array.from(this.files.entries()));
    localStorage.setItem(key, data);
  }

  loadFromLocalStorage(key: string = 'dygram-vfs'): void {
    const data = localStorage.getItem(key);
    if (data) {
      const entries = JSON.parse(data) as Array<[string, string]>;
      this.files = new Map(entries);
    }
  }
}
```

### Playground Component Updates

```typescript
// src/components/CodeMirrorPlayground.tsx (enhanced)
export function CodeMirrorPlayground() {
  const [vfs] = useState(() => new VirtualFileSystem());
  const [currentFile, setCurrentFile] = useState('/main.dygram');
  const [openFiles, setOpenFiles] = useState<string[]>(['/main.dygram']);

  // Initialize VFS with example or load from localStorage
  useEffect(() => {
    vfs.loadFromLocalStorage();

    if (!vfs.exists('/main.dygram')) {
      // Initialize with default example
      vfs.writeFile('/main.dygram', defaultExample);
    }
  }, []);

  // Create language server with VFS resolver
  const languageServer = useMemo(() => {
    const services = createMachineServices();
    const resolver = new VirtualFSResolver(vfs, '/');
    const workspace = new MachineWorkspaceManager(services, resolver);

    return new LanguageServer(services, workspace);
  }, [vfs]);

  // Handle file changes
  const handleFileChange = (path: string, content: string) => {
    vfs.writeFile(path, content);
    vfs.saveToLocalStorage();

    // Trigger recompilation
    languageServer.updateDocument(path, content);
  };

  // Handle file creation
  const handleFileCreate = (path: string) => {
    vfs.writeFile(path, '// New file\n');
    setOpenFiles([...openFiles, path]);
    setCurrentFile(path);
  };

  // Handle imports in editor
  const handleImportClick = async (importPath: string) => {
    try {
      // Resolve import path
      const resolver = new VirtualFSResolver(vfs, '/');
      const resolvedUri = await resolver.resolve(importPath, `vfs://${currentFile}`);
      const resolvedPath = resolvedUri.replace('vfs://', '');

      if (vfs.exists(resolvedPath)) {
        // Open the imported file in a new tab
        if (!openFiles.includes(resolvedPath)) {
          setOpenFiles([...openFiles, resolvedPath]);
        }
        setCurrentFile(resolvedPath);
      } else {
        // Offer to create the file
        const shouldCreate = confirm(`File ${resolvedPath} not found. Create it?`);
        if (shouldCreate) {
          handleFileCreate(resolvedPath);
        }
      }
    } catch (error) {
      console.error('Failed to resolve import:', error);
      alert(`Failed to resolve import: ${importPath}`);
    }
  };

  return (
    <div className="playground">
      <FileTree
        vfs={vfs}
        currentFile={currentFile}
        onFileSelect={setCurrentFile}
        onFileCreate={handleFileCreate}
      />

      <TabBar
        files={openFiles}
        currentFile={currentFile}
        onTabSelect={setCurrentFile}
        onTabClose={(path) => setOpenFiles(openFiles.filter(f => f !== path))}
      />

      <CodeMirrorEditor
        value={vfs.readFile(currentFile) || ''}
        onChange={(content) => handleFileChange(currentFile, content)}
        onImportClick={handleImportClick}
        languageServer={languageServer}
      />

      <OutputPanel
        machineData={languageServer.getMachineData()}
        diagnostics={languageServer.getDiagnostics()}
      />
    </div>
  );
}
```

### File Tree Component

```typescript
// src/components/FileTree.tsx
interface FileTreeProps {
  vfs: VirtualFileSystem;
  currentFile: string;
  onFileSelect: (path: string) => void;
  onFileCreate: (path: string) => void;
}

export function FileTree({ vfs, currentFile, onFileSelect, onFileCreate }: FileTreeProps) {
  const [expanded, setExpanded] = useState(new Set(['/']));

  const files = vfs.getAllFiles();
  const tree = buildTree(files);

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <span>Files</span>
        <button onClick={() => {
          const name = prompt('File name:');
          if (name) {
            onFileCreate(name.startsWith('/') ? name : `/${name}`);
          }
        }}>
          + New File
        </button>
      </div>

      <TreeNode
        node={tree}
        expanded={expanded}
        currentFile={currentFile}
        onToggle={(path) => {
          const newExpanded = new Set(expanded);
          if (newExpanded.has(path)) {
            newExpanded.delete(path);
          } else {
            newExpanded.add(path);
          }
          setExpanded(newExpanded);
        }}
        onSelect={onFileSelect}
      />
    </div>
  );
}

function buildTree(files: Array<{ path: string; content: string }>): TreeNode {
  // Build tree structure from flat file list
  // ...
}
```

### Language Server Worker with VFS

```typescript
// src/language/main-browser.ts (enhanced)
import { VirtualFSResolver } from './resolvers/virtual-fs-resolver.js';
import { MachineWorkspaceManager } from './workspace-manager.js';

export function startLanguageServer(vfs: VirtualFileSystem) {
  const services = createMachineServices();
  const resolver = new VirtualFSResolver(vfs, '/');
  const workspace = new MachineWorkspaceManager(services, resolver);

  // Handle document updates from editor
  self.addEventListener('message', async (event) => {
    const { type, uri, content } = event.data;

    switch (type) {
      case 'update':
        // Update VFS
        const path = uri.replace('vfs://', '');
        vfs.writeFile(path, content);

        // Recompile with imports
        try {
          await workspace.linkAll(uri);

          // Generate outputs
          const entryDoc = workspace.documents.get(uri)!;
          const generator = new MultiFileGenerator();
          const machineData = await generator.generateMachineData(entryDoc, workspace);

          // Send results back to main thread
          self.postMessage({
            type: 'compiled',
            machineData,
            diagnostics: []
          });
        } catch (error) {
          self.postMessage({
            type: 'error',
            error: error.message
          });
        }
        break;
    }
  });
}
```

---

## Error Handling

Comprehensive error handling ensures a good developer experience.

### Error Types and Messages

```typescript
// src/language/import-errors.ts (expanded)

// 1. Module not found
export class ModuleNotFoundError extends ImportError {
  constructor(
    public importPath: string,
    public fromFile: string,
    public resolvedPath?: string
  ) {
    const msg = resolvedPath
      ? `Cannot find module '${importPath}' (resolved to '${resolvedPath}') imported from '${fromFile}'`
      : `Cannot find module '${importPath}' imported from '${fromFile}'`;
    super(msg);
  }
}

// 2. Symbol not found
export class SymbolNotFoundError extends ImportError {
  constructor(
    public symbolName: string,
    public modulePath: string,
    public availableSymbols: string[]
  ) {
    const suggestions = availableSymbols.length > 0
      ? `\n\nAvailable symbols: ${availableSymbols.join(', ')}`
      : '';
    super(
      `Symbol '${symbolName}' not found in '${modulePath}'${suggestions}`
    );
  }
}

// 3. Circular dependency
export class ImportCycleError extends ImportError {
  constructor(public cycles: string[][]) {
    const cycleStr = cycles
      .map(c => '  ' + c.join(' → '))
      .join('\n');
    super(`Circular dependency detected:\n${cycleStr}`);
  }
}

// 4. Naming conflict
export class NamingConflictError extends ImportError {
  constructor(
    public name: string,
    public source1: string,
    public source2: string
  ) {
    super(
      `Naming conflict: '${name}' is defined in both '${source1}' and '${source2}'.\n` +
      `Use 'as' to alias one of the imports:\n` +
      `  import { ${name} as ${name}2 } from "${source2}"`
    );
  }
}

// 5. Invalid import path
export class InvalidImportPathError extends ImportError {
  constructor(public path: string) {
    super(
      `Invalid import path: '${path}'.\n` +
      `Paths must be relative (starting with ./ or ../), absolute (starting with /), or URLs (starting with http:// or https://)`
    );
  }
}
```

### Diagnostic Integration

```typescript
// src/language/import-validator.ts (error reporting)
export class ImportValidator {

  validateImports(
    machine: Machine,
    document: LangiumDocument,
    workspace: MachineWorkspaceManager
  ): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const importStmt of machine.imports) {
      try {
        // Validate path
        const resolvedUri = await workspace.resolver.resolve(
          importStmt.path,
          document.uri.toString()
        );

        // Check if module exists
        const importedDoc = workspace.documents.get(resolvedUri);
        if (!importedDoc) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: `Module not found: ${importStmt.path}`,
            range: getRange(importStmt.$cstNode),
            code: 'module-not-found',
            source: 'dygram-imports'
          });
          continue;
        }

        const importedMachine = importedDoc.parseResult.value as Machine;

        // Validate each imported symbol
        for (const symbol of importStmt.symbols) {
          const found = this.findSymbol(importedMachine, symbol.name);

          if (!found) {
            const available = this.getAvailableSymbols(importedMachine);
            const suggestion = this.findClosestMatch(symbol.name, available);

            let message = `Symbol '${symbol.name}' not found in ${importStmt.path}`;
            if (suggestion) {
              message += `\n\nDid you mean '${suggestion}'?`;
            }

            diagnostics.push({
              severity: DiagnosticSeverity.Error,
              message,
              range: getRange(symbol.$cstNode),
              code: 'symbol-not-found',
              source: 'dygram-imports'
            });
          }
        }

        // Check for naming conflicts
        const localNames = new Map<string, ImportedSymbol[]>();
        for (const symbol of importStmt.symbols) {
          const localName = symbol.alias || this.getShortName(symbol.name);
          if (!localNames.has(localName)) {
            localNames.set(localName, []);
          }
          localNames.get(localName)!.push(symbol);
        }

        for (const [name, symbols] of localNames) {
          if (symbols.length > 1) {
            for (const symbol of symbols) {
              diagnostics.push({
                severity: DiagnosticSeverity.Error,
                message: `Naming conflict: '${name}' is imported multiple times.\nUse 'as' to provide unique aliases.`,
                range: getRange(symbol.$cstNode),
                code: 'naming-conflict',
                source: 'dygram-imports'
              });
            }
          }
        }

      } catch (error) {
        if (error instanceof ModuleNotFoundError) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: error.message,
            range: getRange(importStmt.$cstNode),
            code: 'module-not-found',
            source: 'dygram-imports'
          });
        } else if (error instanceof InvalidImportPathError) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            message: error.message,
            range: getRange(importStmt.$cstNode),
            code: 'invalid-import-path',
            source: 'dygram-imports'
          });
        } else {
          throw error;
        }
      }
    }

    return diagnostics;
  }

  private findSymbol(machine: Machine, qualifiedName: string): Node | undefined {
    // Search logic (same as before)
    // ...
  }

  private getAvailableSymbols(machine: Machine): string[] {
    const symbols: string[] = [];

    const collect = (nodes: Node[], prefix: string = '') => {
      for (const node of nodes) {
        const fullName = prefix ? `${prefix}.${node.name}` : node.name;
        symbols.push(fullName);

        if (node.nodes && node.nodes.length > 0) {
          collect(node.nodes, fullName);
        }
      }
    };

    collect(machine.nodes);
    return symbols;
  }

  private findClosestMatch(target: string, candidates: string[]): string | undefined {
    // Simple Levenshtein distance-based suggestion
    // ...
  }

  private getShortName(qualifiedName: string): string {
    return qualifiedName.split('.').pop()!;
  }
}
```

---

## Security Considerations

Importing code from external sources introduces security risks that must be addressed.

### 1. Path Traversal Protection

```typescript
// src/language/resolvers/filesystem-resolver.ts (security enhancement)
export class FileSystemResolver implements ImportResolver {
  constructor(
    private workingDir: string,
    private allowedPaths?: string[]  // Whitelist of allowed directories
  ) {}

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    // ... existing resolution logic ...

    // Security: Validate resolved path is within allowed directories
    const normalizedPath = path.normalize(resolvedPath);

    if (this.allowedPaths) {
      const isAllowed = this.allowedPaths.some(allowed =>
        normalizedPath.startsWith(path.normalize(allowed))
      );

      if (!isAllowed) {
        throw new SecurityError(
          `Access denied: ${resolvedPath} is outside allowed directories`
        );
      }
    }

    // Security: Prevent directory traversal outside working directory
    const normalizedWorkingDir = path.normalize(this.workingDir);
    if (!normalizedPath.startsWith(normalizedWorkingDir)) {
      throw new SecurityError(
        `Access denied: ${resolvedPath} is outside working directory`
      );
    }

    return pathToFileURL(resolvedPath).toString();
  }
}
```

### 2. URL Import Restrictions

```typescript
// src/language/resolvers/url-resolver.ts (security enhancement)
export class URLResolver implements ImportResolver {
  constructor(
    private allowedDomains?: string[],  // Whitelist of allowed domains
    private maxFileSize: number = 1024 * 1024  // 1MB default limit
  ) {}

  async resolve(importPath: string, currentFileUri: string): Promise<string> {
    // ... existing resolution logic ...

    // Security: Validate domain whitelist
    if (this.allowedDomains) {
      const url = new URL(resolvedUrl);
      const isAllowed = this.allowedDomains.some(domain =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`)
      );

      if (!isAllowed) {
        throw new SecurityError(
          `Access denied: ${url.hostname} is not in allowed domains`
        );
      }
    }

    // Security: Only allow HTTPS (not HTTP) in production
    if (resolvedUrl.startsWith('http://') && process.env.NODE_ENV === 'production') {
      throw new SecurityError(
        `Insecure import: HTTP imports are not allowed in production. Use HTTPS.`
      );
    }

    return resolvedUrl;
  }

  async load(resolvedUri: string): Promise<string> {
    // ... existing load logic ...

    // Security: Check content length before downloading
    const headResponse = await fetch(resolvedUri, { method: 'HEAD' });
    const contentLength = parseInt(headResponse.headers.get('content-length') || '0');

    if (contentLength > this.maxFileSize) {
      throw new SecurityError(
        `File too large: ${resolvedUri} exceeds ${this.maxFileSize} bytes`
      );
    }

    // ... download and cache ...
  }
}
```

### 3. Import Depth Limit

```typescript
// src/language/workspace-manager.ts (security enhancement)
export class MachineWorkspaceManager {
  private maxImportDepth = 10;  // Prevent infinite recursion
  private loadDepth = 0;

  async loadDocument(uri: string, entryPoint: boolean = false): Promise<LangiumDocument> {
    // Security: Enforce import depth limit
    if (this.loadDepth >= this.maxImportDepth) {
      throw new SecurityError(
        `Import depth limit exceeded (${this.maxImportDepth}). ` +
        `This may indicate a circular dependency or overly deep import chain.`
      );
    }

    this.loadDepth++;
    try {
      // ... existing load logic ...
    } finally {
      this.loadDepth--;
    }
  }
}
```

### 4. Code Injection Prevention

```typescript
// Security: Ensure imported code is only parsed as DyGram DSL
// No eval() or dynamic code execution of imported content
// Langium parser provides natural protection as it only accepts valid grammar

// Additional validation in load():
async load(resolvedUri: string): Promise<string> {
  const content = await this.fetchContent(resolvedUri);

  // Security: Basic sanity check
  if (content.length > 10 * 1024 * 1024) {  // 10MB limit
    throw new SecurityError(`File too large: ${resolvedUri}`);
  }

  // Security: Validate content is text (not binary)
  if (!this.isValidText(content)) {
    throw new SecurityError(`Invalid file content: ${resolvedUri} is not valid text`);
  }

  return content;
}

private isValidText(content: string): boolean {
  // Check for binary content (null bytes, excessive non-printable chars)
  const nullBytes = (content.match(/\0/g) || []).length;
  if (nullBytes > 0) return false;

  const nonPrintable = content.split('').filter(c => {
    const code = c.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;  // Allow tab, LF, CR
  }).length;

  return nonPrintable / content.length < 0.01;  // Less than 1% non-printable
}
```

### 5. Sandbox Execution (Future Enhancement)

For maximum security when executing imported machines:

```typescript
// Future: Sandbox execution environment
// - Use VM2 or isolated-vm for Node.js
// - Use Web Workers for browser
// - Restrict file system access
// - Limit network access
// - Set resource limits (memory, CPU time)

// Example (pseudocode):
import { VM } from 'vm2';

export class SandboxedExecutor extends RailsExecutor {
  private vm = new VM({
    timeout: 60000,  // 60s timeout
    sandbox: {
      // Limited global context
    }
  });

  async executeNode(nodeName: string): Promise<ExecutionResult> {
    // Execute in sandbox
    return this.vm.run(() => super.executeNode(nodeName));
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Basic import infrastructure without multi-file support

**Tasks**:
1. ✅ Grammar extension
   - Add `ImportStatement` and `ImportedSymbol` rules
   - Update `Machine` entry rule
   - Regenerate parser

2. ✅ Module resolution interfaces
   - Define `ImportResolver` interface
   - Implement `FileSystemResolver`
   - Implement basic `URLResolver`

3. ✅ Dependency graph
   - Implement `DependencyGraph` class
   - Cycle detection algorithm
   - Topological sort

4. ✅ Error classes
   - Define all import-related error types
   - Implement error messages

**Deliverable**: Can parse import syntax, resolve paths, detect cycles

### Phase 2: Linking and Scope (Weeks 3-4)

**Goal**: Multi-file linking and symbol resolution

**Tasks**:
1. ✅ Workspace manager
   - Implement `MachineWorkspaceManager`
   - Multi-document loading
   - Recursive import resolution

2. ✅ Multi-file linker
   - Extend `MachineLinker` to `MultiFileMachineLinker`
   - Import scope building
   - Cross-file reference resolution

3. ✅ Scope provider extension
   - Extend `MachineScopeProvider` to `MultiFileScopeProvider`
   - Merge local and imported scopes

4. ✅ Symbol resolution
   - Qualified name lookup in imported modules
   - Short name extraction
   - Node cloning/referencing

**Deliverable**: Can link and resolve references across multiple files

### Phase 3: Validation (Week 5)

**Goal**: Comprehensive import validation

**Tasks**:
1. ✅ Import validator
   - Implement `ImportValidator` class
   - Validate paths, symbols, conflicts

2. ✅ Integration with existing validators
   - Update `MachineValidator`
   - Update `TypeChecker` (if needed)
   - Update `GraphValidator` (if needed)

3. ✅ Diagnostic messages
   - User-friendly error messages
   - Suggestions and hints

**Deliverable**: Comprehensive import error reporting

### Phase 4: Generation and Execution (Week 6)

**Goal**: Multi-file generation and execution

**Tasks**:
1. ✅ Multi-file generator
   - Implement `MultiFileGenerator`
   - Machine merging
   - Source file annotation

2. ✅ Executor enhancement (optional)
   - Source file tracking in execution history
   - Enhanced debugging

3. ✅ Testing
   - Unit tests for all components
   - Integration tests for multi-file scenarios
   - Edge case testing

**Deliverable**: Can generate and execute multi-file machines

### Phase 5: CLI Integration (Week 7)

**Goal**: CLI support for imports

**Tasks**:
1. ✅ Command updates
   - Update `generate` command
   - Update `execute` command
   - Update `parseAndValidate` command

2. ✅ New commands
   - Implement `check-imports` command
   - Implement `bundle` command

3. ✅ Watch mode
   - Implement file watching with imports
   - Incremental recompilation

**Deliverable**: Full CLI support for multi-file machines

### Phase 6: Playground Integration (Weeks 8-9)

**Goal**: Playground support for imports

**Tasks**:
1. ✅ Virtual filesystem
   - Implement `VirtualFileSystem` class
   - LocalStorage persistence

2. ✅ VFS resolver
   - Implement `VirtualFSResolver`

3. ✅ UI components
   - File tree component
   - Tab bar for multiple open files
   - Import navigation

4. ✅ Language server updates
   - Web worker with VFS support
   - Multi-file compilation in browser

**Deliverable**: Full playground support for multi-file editing

### Phase 7: Advanced Features (Weeks 10-12)

**Goal**: Polish and advanced features

**Tasks**:
1. ✅ URL imports
   - Full `URLResolver` implementation
   - Caching strategy
   - Security restrictions

2. ✅ Security hardening
   - Path traversal protection
   - Domain whitelisting
   - Resource limits

3. ✅ Performance optimization
   - Module caching improvements
   - Incremental parsing
   - Lazy loading

4. ✅ Documentation
   - User guide for imports
   - API documentation
   - Examples and tutorials

**Deliverable**: Production-ready import system

### Phase 8: Future Enhancements (Future)

**Potential features for later versions**:

1. **Package Manager Integration**
   - `dygram install <package>` command
   - `dygram.json` manifest file
   - Version resolution
   - Dependency locking

2. **Module Prefixes**
   ```dy
   import * as auth from "./auth.dygram"

   machine "App" {
     start -> auth.LoginTask -> auth.ValidateUser -> end;
   }
   ```

3. **Re-exports**
   ```dy
   export { LoginTask, LogoutTask } from "./auth.dygram"
   export { UserProfile, UserSettings } from "./user.dygram"
   ```

4. **Private Symbols**
   ```dy
   private node _InternalHelper { ... }
   ```

5. **Standard Library**
   - Built-in modules (http, json, validation, etc.)
   - Auto-imported or via `@dygram/stdlib`

6. **Type Imports**
   ```dy
   import type { UserType, SessionType } from "./types.dygram"
   ```

---

## Appendix

### A. Example Multi-File Project

```
my-project/
├── main.dygram          # Entry point
├── lib/
│   ├── auth.dygram      # Authentication flows
│   ├── payment.dygram   # Payment processing
│   └── common.dygram    # Shared utilities
└── types/
    └── user.dygram      # User-related types
```

**main.dygram**:
```dy
import { LoginTask, ValidateSession } from "./lib/auth.dygram"
import { ProcessPayment, RefundPayment } from "./lib/payment.dygram"
import { ErrorHandler, Logger } from "./lib/common.dygram"

machine "E-Commerce App" {
  use ErrorHandler;
  use Logger;

  start -> LoginTask -> ValidateSession -> MainMenu;

  MainMenu -> ProcessPayment -> ConfirmOrder -> end;
  MainMenu -> ViewOrders -> RefundPayment -> end;
}
```

**lib/auth.dygram**:
```dy
machine "Authentication" {
  task LoginTask {
    prompt: "Authenticate user with credentials"
    llm.temperature: 0.3
  }

  task ValidateSession {
    prompt: "Validate user session token"
  }

  context UserSession {
    token: string
    userId: string
    expiresAt: string
  }

  LoginTask -> UserSession -> ValidateSession;
}
```

**lib/payment.dygram**:
```dy
import { UserSession } from "./auth.dygram"

machine "Payment Processing" {
  task ProcessPayment {
    prompt: "Process payment with payment gateway"
    llm.temperature: 0.1
  }

  task RefundPayment {
    prompt: "Issue refund to customer"
  }

  context PaymentResult {
    success: boolean
    transactionId: string
    amount: number
  }

  ProcessPayment -> PaymentResult;
}
```

**lib/common.dygram**:
```dy
machine "Common Utilities" {
  task ErrorHandler {
    prompt: "Handle errors gracefully and log them"
    @meta  // Can modify machine structure
  }

  task Logger {
    prompt: "Log events and state transitions"
  }
}
```

### B. Performance Benchmarks (Target)

| Operation | Single File | 10 Files | 100 Files |
|-----------|-------------|----------|-----------|
| Parse     | 10ms        | 50ms     | 400ms     |
| Link      | 5ms         | 30ms     | 250ms     |
| Validate  | 5ms         | 25ms     | 200ms     |
| Generate  | 5ms         | 20ms     | 150ms     |
| **Total** | **25ms**    | **125ms**| **1000ms**|

### C. Compatibility Matrix

| Feature | CLI | Playground | Status |
|---------|-----|------------|--------|
| Local file imports | ✅ | ✅ (VFS) | Phase 6 |
| URL imports | ✅ | ✅ | Phase 7 |
| Relative paths | ✅ | ✅ | Phase 2 |
| Absolute paths | ✅ | ⚠️ (VFS only) | Phase 6 |
| Qualified names | ✅ | ✅ | Phase 2 |
| Aliasing | ✅ | ✅ | Phase 2 |
| Cycle detection | ✅ | ✅ | Phase 1 |
| Watch mode | ✅ | ➖ | Phase 5 |

---

## Conclusion

This low-level design provides a comprehensive blueprint for implementing an ES6-style import system in DyGram. The design:

1. ✅ Supports the preferred syntax: `import { ... } from "..."`
2. ✅ Enables URL imports
3. ✅ Defaults to exporting all symbols (no explicit export syntax)
4. ✅ Integrates seamlessly across all language stages
5. ✅ Works identically in CLI and playground contexts
6. ✅ Maintains backward compatibility with single-file machines
7. ✅ Provides comprehensive error handling and security

The phased implementation approach allows for incremental development and testing, with each phase building on the previous one. The design is extensible to support future enhancements like package management, module prefixes, and re-exports.

Implementation can begin immediately with Phase 1 (Foundation), establishing the core infrastructure that all subsequent phases will build upon.
