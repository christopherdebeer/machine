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

```dy examples/imports/basic-import.dygram
import { LoginPage, UserSession } from "./auth-lib.dy"

machine "Main Application"

state Dashboard "User Dashboard"
state Profile "User Profile"

LoginPage --> Dashboard --> Profile --> UserSession
```

The imported file (`auth-lib.dy`):

```dy examples/imports/auth-lib.dygram
machine "Auth Library"

state LoginPage "User Login"
state AuthService "Authentication"
state UserSession "Active Session"

LoginPage --> AuthService --> UserSession
```

## Import Features

### Named Imports

Import specific nodes by name:

```dy examples/imports/named-imports.dygram
import { Start, Process, End } from "./workflow.dy"

machine "Extended Workflow"

state Init "Initialize"
state Finalize "Finalize"

Init --> Start --> Process --> End --> Finalize
```

### Import Aliasing

Rename imported nodes to avoid name collisions:

```dy examples/imports/import-aliasing.dygram
import { Start as StartA, Process as ProcessA } from "./module-a.dy"
import { Start as StartB, Process as ProcessB } from "./module-b.dy"

machine "Combined Application"

state Init "Initialize"
state Final "Final State"

Init --> StartA --> ProcessA --> ProcessB --> StartB --> Final
```

### Qualified Name Imports

Import nodes with qualified names for better organization:

```dy examples/imports/qualified-imports.dygram
import { Workflow.Validate, Workflow.Process } from "./workflows.dy"

machine "Simplified App"

state Start "Start"
state End "End"

Start --> Workflow.Validate --> Workflow.Process --> End
```

### Multiple Imports

Import from multiple files:

```dy examples/imports/multiple-imports.dygram
import { LoginPage } from "./auth.dy"
import { ShoppingCart } from "./cart.dy"
import { Checkout } from "./payment.dy"

machine "E-Commerce Application"

state Home "Homepage"
state Complete "Order Complete"

Home --> LoginPage --> ShoppingCart --> Checkout --> Complete
```

## Module Resolution

DyGram resolves imports using multiple strategies depending on the execution context:

### Relative Paths

Use `./` and `../` for relative imports:

```dy
import { Task } from "./tasks.dy"        // Same directory
import { Config } from "../config.dy"    // Parent directory
import { Utils } from "../../shared/utils.dy"  // Multiple levels up
```

### Filesystem Resolution (CLI)

When using the CLI, imports are resolved relative to the current file's location on the filesystem:

```bash
dygram generate app.dygram
# Resolves imports relative to app.dy's directory
```

### Virtual Filesystem (Playground)

In the browser playground, imports are resolved from the virtual filesystem stored in localStorage:

```dy
import { Component } from "/components/ui.dy"  // Absolute VFS path
import { Helper } from "./utils.dy"            // Relative VFS path
```

### URL Imports (Future)

URL imports will be supported for loading remote modules:

```dy
import { Template } from "https://cdn.dy.dev/templates/auth.dy"
```

## Automatic Exports

All top-level nodes in a DyGram file are automatically exported. No explicit `export` keyword is needed:

```dy examples/imports/auto-export-lib.dygram
machine "Library"

// All these nodes are automatically exported
state PublicStateA "Available for import"
state PublicStateB "Also available"
Task PublicTask "This too"
```

Any file can import these nodes:

```dy examples/imports/auto-export-usage.dygram
import { PublicStateA, PublicTask } from "./auto-export-lib.dy"

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
  /app.dy → /lib.dy → /app.dygram
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
  ./workflow-a.dy exports Process
  ./workflow-b.dy exports Process
  Suggestion: Use import aliasing to resolve collision
```

### Missing Symbols

Importing non-existent symbols:

```
Error: Symbol 'NonExistent' not found in './lib.dy'
  Available symbols: LoginPage, AuthService, UserSession
```

## Best Practices

### 1. Use Meaningful Filenames

Choose descriptive filenames that reflect the module's purpose:

```
auth.dy           # Authentication components
cart.dy          # Shopping cart logic
payment.dy       # Payment processing
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

```dy
import { Validate as ValidateAuth } from "./auth.dy"
import { Validate as ValidatePayment } from "./payment.dy"
```

### 4. Keep Dependencies Shallow

Avoid deep import chains. If you find yourself importing from imports, consider restructuring:

```
❌ app.dy → utils.dy → helpers.dy → core.dy (too deep)
✅ app.dy → utils.dy, helpers.dy (flatter structure)
```

### 5. Create Shared Libraries

Extract reusable components into dedicated library files:

```dy examples/imports/shared-library.dygram
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
dygram bundle app.dy --output dist/app.bundled.dygram
# Creates a single file with all imports merged
```

### Disable Imports

Skip import resolution when needed:

```bash
dygram generate app.dy --no-imports
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
  http://example.com/lib.dy → Security risk
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
  sourceFile: "/auth.dy",
  sourceLine: 5,
  importedBy: ["/app.dy"]
}
```

## Limitations

### Current Limitations

1. **No wildcard imports**: `import * as Auth from "./auth.dy"` not yet supported
2. **No re-exports**: `export { X } from "./lib.dy"` not yet supported
3. **No dynamic imports**: `import()` expressions not supported
4. **No package imports**: npm-style packages not yet supported

### Future Enhancements

Planned features for future releases:

- **Package manager integration**: Import from published packages
- **Module prefixes**: `import * as Auth from "./auth.dy"`
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
