# Qualified Names

Qualified names allow you to reference nodes using dot notation (e.g., `Parent.Child.GrandChild`), providing a powerful mechanism for working with nested structures and avoiding name collisions.

## Overview

With qualified names, you can:
- **Define nodes** with qualified names at any level
- **Reference nested nodes** using their hierarchical path
- **Avoid name collisions** when similar names exist in different contexts
- **Quick scaffold** complex structures without explicit nesting

## Basic Usage

### Referencing Nested Nodes

The most common use case is referencing nodes inside parent containers:

```dy
machine "Basic Qualified Names"

Workflow {
    task Start "Initialize workflow";
    task Process "Process data";
    task Complete "Finalize";
}

// Reference nested nodes using qualified names
Init -> Workflow.Start;
Workflow.Start -> Workflow.Process -> Workflow.Complete;
Workflow.Complete -> Done;
```

### Defining Nodes with Qualified Names

You can also define nodes using qualified names, which creates implicit namespace structure:

```dy
machine "Quick Scaffolding"

// Define nodes with qualified names at root level
note API.Authentication "Handles user authentication";
task API.DataFetch "Fetches data from database";
task API.Response "Formats and returns response";

Start -> API.Authentication -> API.DataFetch -> API.Response -> End;
```

This is particularly useful for rapid prototyping and scaffolding.

## Scoping and Resolution

### Simple Names (Backward Compatible)

Simple node names work exactly as before:

```dy
machine "Simple Names"

Parent {
    Child1;
    Child2;
}

// Simple names resolve correctly
Child1 -> Child2;
```

### Qualified References

When nodes are nested, they can be referenced using their qualified path:

```dy
machine "Qualified References"

Group1 {
    task Step "Step in Group1";
}

Group2 {
    task Step "Step in Group2";  // Same simple name, different parent
}

// Qualified names make references unambiguous
Start -> Group1.Step;
Group1.Step -> Group2.Step;
Group2.Step -> End;
```

### Deep Nesting

Qualified names support arbitrary nesting depth:

```dy
machine "Deep Nesting"

Level1 {
    Level2 {
        Level3 {
            DeepNode;
        }
    }
}

Start -> Level1.Level2.Level3.DeepNode -> End;
```

## Conflict Resolution

The scope provider intelligently handles naming conflicts using a two-pass resolution strategy:

### Simple vs. Qualified Nodes

When a simple node and a qualified node have overlapping names, both remain accessible:

```dy
machine "Collision Handling"

Group {
    task Child "Simple child";
    note Group.Child "Explicit qualified child";
}

Start;
End;

// Both nodes are accessible
Start -> Child;              // References simple child
Child -> Group.Child;        // References qualified child
Group.Child -> End;
```

**Resolution Strategy:**
- Simple node `Child` registers aliases: `"Child"`, `"Group.Child"` (if no explicit qualified node exists)
- Qualified node `Group.Child` registers aliases: `"Group.Child"`, `"Child"` (if no simple node exists)
- When both exist, each keeps their explicit name, preventing collisions

### Priority Rules

1. **Explicit always wins over implicit**
   - A node explicitly named `Group.Child` takes precedence over implicit `Group.Child` alias

2. **Simple names work as shortcuts**
   - If no conflict exists, simple names can be used as shortcuts

3. **Qualified names provide disambiguation**
   - When conflicts occur, qualified names ensure unambiguous references

## Advanced Patterns

### Mixed Naming Strategies

You can freely mix simple and qualified names:

```dy
machine "Mixed Naming"

Pipeline {
    task Simple "Regular task";
    task Pipeline.Explicit "Explicitly qualified task";
}

Start -> Simple;                    // Simple reference
Simple -> Pipeline.Explicit;        // Qualified reference
Pipeline.Explicit -> End;
```

### Root-Level Qualified Names

Create implicit namespaces at the root level:

```dy
machine "Root Namespaces"

// Create implicit namespace structure
note Services.Auth "Authentication service";
note Services.Data "Data access service";
note Services.Cache "Caching layer";

task Orchestrator "Main orchestrator";

Orchestrator -> Services.Auth;
Orchestrator -> Services.Data;
Orchestrator -> Services.Cache;
```

### Shorthand Access

When no conflicts exist, nodes can be accessed via their simple name:

```dy
machine "Shorthand Access"

API {
    Endpoint {
        Handler;
    }
}

// These are equivalent when no conflicts exist:
Start -> Handler;                          // Shorthand
Start -> API.Endpoint.Handler;             // Full path
```

## Edge Attributes Compatibility

Qualified names work seamlessly with edge attributes:

```dy
machine "Edge Attributes"

Workflow {
    task Validate "Validation step";
    task Transform "Transformation step";
}

// Qualified names with edge attributes
Start -priority: 1;-> Workflow.Validate;
Workflow.Validate -weight: 0.8; condition: "ready";-> Workflow.Transform;
Workflow.Transform -timeout: 5000;-> End;
```

**Technical Note:** Edge attribute names are simple identifiers (`ID`), while edge targets use qualified names (`QualifiedName`), preventing any parsing ambiguity.

## Notes and Documentation

Qualified names work with all node types, including notes:

```dy
machine "Documented System"

Processor {
    Input;
    Validate;
    Transform;
    Output;
}

// Attach notes using qualified names
note Processor.Validate "Validates input against schema. Throws ValidationError on failure.";
note Processor.Transform "Applies transformation rules from config.rules array.";

Start -> Processor.Input -> Processor.Validate -> Processor.Transform -> Processor.Output -> End;
```

## Best Practices

### 1. Use for Organization

Qualified names are excellent for organizing related nodes:

```dy
machine "Organized Structure"

// Group related authentication nodes
Auth.Login;
Auth.Verify;
Auth.Logout;

// Group related data operations
Data.Fetch;
Data.Transform;
Data.Store;
```

### 2. Rapid Prototyping

Quick scaffold complex structures without explicit nesting:

```dy
machine "Quick Prototype"

// Rapidly define structure
task UI.LoginForm "User login form";
task UI.Dashboard "Main dashboard";
task Backend.AuthService "Authentication service";
task Backend.DataService "Data access layer";

UI.LoginForm -> Backend.AuthService -> UI.Dashboard;
UI.Dashboard -> Backend.DataService;
```

### 3. Avoid Over-Nesting

While qualified names support deep nesting, keep hierarchies manageable:

```dy
// ✅ Good: 2-3 levels
API.Users.GetProfile;
API.Users.UpdateProfile;

// ⚠️ Avoid: Too deep
System.API.Services.Users.Controllers.Handlers.GetProfile;
```

### 4. Consistent Naming

Be consistent with naming strategies within a machine:

```dy
machine "Consistent Naming"

// ✅ Good: Consistent use of qualified names for grouping
Auth.Login;
Auth.Register;
Data.Fetch;
Data.Store;

// ⚠️ Avoid: Mixing strategies inconsistently
Auth.Login;
Register;  // Inconsistent - should be Auth.Register
Data.Fetch;
store;     // Inconsistent - should be Data.Store
```

## Implementation Details

### Grammar

Qualified names are defined in the grammar as:

```
QualifiedName returns string:
    ID ('.' ID)*
;
```

This allows for any depth of qualification using dot notation.

### Scope Provider

The `MachineScopeProvider` implements intelligent conflict resolution:

1. **Pass 1: Conflict Detection**
   - Identifies all simple names actually used
   - Identifies all explicit qualified names used

2. **Pass 2: Smart Alias Registration**
   - Registers primary name (simple or qualified)
   - Registers alternate aliases only when no conflict exists
   - Ensures all nodes remain uniquely referenceable

### Node References

Qualified names are supported in:
- **Edge sources**: `Group.Child1 -> Group.Child2`
- **Edge targets**: `Start -> Group.Child`
- **Note names**: `note Group.Child "Documentation"`
- **Node definitions**: `task Group.Task "Explicit qualified node"`

## Examples

### Complete Example

```dy
machine "E-Commerce Order Processing" @Version("1.0")

// Define workflow structure using qualified names
context OrderConfig {
    timeout<Duration>: "PT5M";
    maxRetries<number>: 3;
}

// Quick scaffold using qualified names at root
task Payment.Validate "Validate payment method";
task Payment.Process "Process payment transaction";
task Payment.Confirm "Confirm payment completion";

task Inventory.Check "Check item availability";
task Inventory.Reserve "Reserve inventory";
task Inventory.Allocate "Allocate items for order";

task Shipping.Calculate "Calculate shipping cost";
task Shipping.Label "Generate shipping label";
task Shipping.Dispatch "Dispatch order";

// Nested structure with explicit relationships
Process OrderWorkflow {
    State Received "Order received";
    State Processing "Processing order";
    State Completed "Order completed";

    Received -> Processing -> Completed;
}

// Wire up the workflow
OrderWorkflow.Received -> Payment.Validate;
Payment.Validate -> Payment.Process -> Payment.Confirm;
Payment.Confirm -> Inventory.Check;

Inventory.Check -> Inventory.Reserve -> Inventory.Allocate;
Inventory.Allocate -> Shipping.Calculate;

Shipping.Calculate -> Shipping.Label -> Shipping.Dispatch;
Shipping.Dispatch -> OrderWorkflow.Completed;

// Add documentation
note Payment "Payment processing subsystem handles all financial transactions";
note Inventory "Inventory management ensures accurate stock tracking";
note Shipping "Shipping workflow coordinates with external carriers";
```

## See Also

- **[Nodes](nodes.md)** - Node definition syntax
- **[Edges](edges.md)** - Edge and relationship syntax
- **[Nesting](nesting.md)** - Semantic nesting and context inheritance
- **[Identifiers](identifiers.md)** - Naming rules and conventions
