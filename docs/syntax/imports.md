# Imports

DyGram supports ES6-style imports for modular, multi-file machine definitions. The import system enables code reuse, better organization, and collaborative development.

## Overview

Imports allow you to:
- **Reuse components** across multiple machines
- **Organize complex systems** into manageable files
- **Share libraries** of common patterns
- **Collaborate** on large projects with clear module boundaries

## Basic Import Syntax

Import named nodes from other files using familiar ES6-style syntax:

```dygram examples/imports/basic-import.dygram
import { LoginPage, UserSession } from "./auth-lib.dygram"

machine "Main Application"

state Dashboard "User Dashboard"
state Profile "User Profile"

LoginPage --> Dashboard --> Profile --> UserSession
```

The imported file (`auth-lib.dygram`):

```dygram examples/imports/auth-lib.dygram
machine "Auth Library"

state LoginPage "User Login"
state AuthService "Authentication"
state UserSession "Active Session"

LoginPage --> AuthService --> UserSession
```

## Import Features

### Named Imports

Import specific nodes by name:

```dygram examples/imports/named-imports.dygram
import { Start, Process, End } from "./workflow.dygram"

machine "Extended Workflow"

state Init "Initialize"
state Finalize "Finalize"

Init --> Start --> Process --> End --> Finalize
```

### Import Aliasing

Rename imported nodes to avoid name collisions:

```dygram examples/imports/import-aliasing.dygram
import { Start as StartA, Process as ProcessA } from "./module-a.dygram"
import { Start as StartB, Process as ProcessB } from "./module-b.dygram"

machine "Combined Application"

state Init "Initialize"
state Final "Final State"

Init --> StartA --> ProcessA --> ProcessB --> StartB --> Final
```

### Qualified Name Imports

Import nodes with qualified names for better organization:

```dygram examples/imports/qualified-imports.dygram
import { Workflow.Validate, Workflow.Process } from "./workflows.dygram"

machine "Simplified App"

state Start "Start"
state End "End"

Start --> Workflow.Validate --> Workflow.Process --> End
```

### Multiple Imports

Import from multiple files:

```dygram examples/imports/multiple-imports.dygram
import { LoginPage } from "./auth.dygram"
import { ShoppingCart } from "./cart.dygram"
import { Checkout } from "./payment.dygram"

machine "E-Commerce Application"

state Home "Homepage"
state Complete "Order Complete"

Home --> LoginPage --> ShoppingCart --> Checkout --> Complete
```

## Module Resolution

DyGram resolves imports using multiple strategies depending on the execution context:

### Relative Paths

Use `./` and `../` for relative imports:

```dygram
import { Task } from "./tasks.dygram"        // Same directory
import { Config } from "../config.dygram"    // Parent directory
import { Utils } from "../../shared/utils.dygram"  // Multiple levels up
```

### Filesystem Resolution (CLI)

When using the CLI, imports are resolved relative to the current file's location on the filesystem:

```bash
dygram generate app.dygram
# Resolves imports relative to app.dygram's directory
```

### Virtual Filesystem (Playground)

In the browser playground, imports are resolved from the virtual filesystem stored in localStorage:

```dygram
import { Component } from "/components/ui.dygram"  // Absolute VFS path
import { Helper } from "./utils.dygram"            // Relative VFS path
```

### URL Imports (Future)

URL imports will be supported for loading remote modules:

```dygram
import { Template } from "https://cdn.dygram.dev/templates/auth.dygram"
```

## Automatic Exports

All top-level nodes in a DyGram file are automatically exported. No explicit `export` keyword is needed:

```dygram examples/imports/auto-export-lib.dygram
machine "Library"

// All these nodes are automatically exported
state PublicStateA "Available for import"
state PublicStateB "Also available"
Task PublicTask "This too"
```

Any file can import these nodes:

```dygram examples/imports/auto-export-usage.dygram
import { PublicStateA, PublicTask } from "./auto-export-lib.dygram"

machine "Consumer"

state LocalState "Local node"

LocalState --> PublicStateA --> PublicTask
```

## Validation and Error Handling

The import system performs comprehensive validation:

### Circular Dependency Detection

Circular imports are detected and reported:

```
Error: Circular dependency detected
  /app.dygram → /lib.dygram → /app.dygram
```

### Symbol Collision Detection

Collisions between imported and local symbols are caught:

```
Error: Symbol collision - 'LoginPage' is both imported and defined locally
  Imported from: ./auth.dygram
  Local definition: line 5
```

### Cross-Import Collisions

Importing the same symbol name from different files:

```
Error: Symbol name collision - 'Process' imported from multiple sources
  ./workflow-a.dygram exports Process
  ./workflow-b.dygram exports Process
  Suggestion: Use import aliasing to resolve collision
```

### Missing Symbols

Importing non-existent symbols:

```
Error: Symbol 'NonExistent' not found in './lib.dygram'
  Available symbols: LoginPage, AuthService, UserSession
```

## Best Practices

### 1. Use Meaningful Filenames

Choose descriptive filenames that reflect the module's purpose:

```
auth.dygram           # Authentication components
cart.dygram          # Shopping cart logic
payment.dygram       # Payment processing
```

### 2. Organize by Domain

Structure files by domain or feature:

```
/auth/
  login.dygram
  session.dygram
/checkout/
  cart.dygram
  payment.dygram
/core/
  config.dygram
  utils.dygram
```

### 3. Use Aliasing for Clarity

When importing similar components, use aliases:

```dygram
import { Validate as ValidateAuth } from "./auth.dygram"
import { Validate as ValidatePayment } from "./payment.dygram"
```

### 4. Keep Dependencies Shallow

Avoid deep import chains. If you find yourself importing from imports, consider restructuring:

```
❌ app.dygram → utils.dygram → helpers.dygram → core.dygram (too deep)
✅ app.dygram → utils.dygram, helpers.dygram (flatter structure)
```

### 5. Create Shared Libraries

Extract reusable components into dedicated library files:

```dygram examples/imports/shared-library.dygram
machine "Common Patterns"

// Reusable authentication flow
state Authenticate "User Authentication"
state Authorize "Authorization Check"
state SessionCreate "Create Session"

Authenticate --> Authorize --> SessionCreate

// Reusable error handling
state ErrorHandler "Error Handler"
state Retry "Retry Logic"
state Fallback "Fallback State"

ErrorHandler --> Retry --> Fallback
```

## CLI Integration

### Auto-Discovery

The CLI automatically discovers and resolves imports:

```bash
dygram generate app.dygram
# Automatically resolves all imports transitively
```

### Check Imports

Validate imports and view the dependency graph:

```bash
dygram check-imports app.dygram
# Shows:
# - All imported files
# - Dependency graph
# - Any circular dependencies
# - Symbol conflicts
```

### Bundle Files

Merge multi-file projects into a single file:

```bash
dygram bundle app.dygram --output dist/app.bundled.dygram
# Creates a single file with all imports merged
```

### Disable Imports

Skip import resolution when needed:

```bash
dygram generate app.dygram --no-imports
# Treats file as standalone (imports not resolved)
```

## Security Considerations

### Filesystem Access

CLI import resolution only accesses files within the project directory. Absolute paths outside the project are rejected:

```
Warning: Absolute path imports outside project directory are not allowed
  /etc/passwd → Rejected
```

### URL Imports

When URL imports are enabled, only HTTPS URLs are allowed by default:

```
Warning: HTTP import detected - consider using HTTPS
  http://example.com/lib.dygram → Security risk
```

## Technical Details

### Dependency Graph

Imports are resolved using a directed acyclic graph (DAG):

1. **Parse** all imported files
2. **Build** dependency graph
3. **Detect** cycles (error if found)
4. **Sort** topologically for correct merge order
5. **Link** symbols across files
6. **Validate** all references

### Symbol Resolution

Imported symbols are resolved in this order:

1. **Local symbols** (defined in current file)
2. **Imported symbols** (from import statements)
3. **Nested symbols** (using qualified names)

### Source Tracking

The multi-file generator tracks the origin of all nodes:

```typescript
{
  node: "LoginPage",
  sourceFile: "/auth.dygram",
  sourceLine: 5,
  importedBy: ["/app.dygram"]
}
```

## Limitations

### Current Limitations

1. **No wildcard imports**: `import * as Auth from "./auth.dygram"` not yet supported
2. **No re-exports**: `export { X } from "./lib.dygram"` not yet supported
3. **No dynamic imports**: `import()` expressions not supported
4. **No package imports**: npm-style packages not yet supported

### Future Enhancements

Planned features for future releases:

- **Package manager integration**: Import from published packages
- **Module prefixes**: `import * as Auth from "./auth.dygram"`
- **Re-exports**: Aggregate and re-export modules
- **CDN support**: Load modules from CDN with caching
- **Import maps**: Configure module resolution mappings

## Examples

See the [Examples documentation](../examples/imports.md) for comprehensive real-world examples:

- Authentication flows
- E-commerce workflows
- Workflow orchestration
- Multi-team collaboration patterns

## See Also

- **[Qualified Names](qualified-names.md)** - Dot notation for nested references
- **[Machines](machines.md)** - Top-level machine declarations
- **[Nodes](nodes.md)** - Building blocks of machines
- **[CLI Reference](../cli/README.md)** - Command-line tools

---

**Note**: The import system is fully functional in the CLI. Playground integration is in progress.
