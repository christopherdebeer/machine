# Identifiers

Identifiers are names used for nodes, attributes, types, and annotations in DyGram. They follow specific naming rules and can be simple or qualified.

## Basic Rules

Identifiers must:
- Start with a **letter** (a-z, A-Z) or **underscore** (_)
- Contain only **letters**, **digits** (0-9), or **underscores**

Valid identifiers:

```dygram examples/syntax/node-identifiers.dygram
validName;
_private;
user123;
handle_event;
```

Invalid identifiers:
```dygram
123invalid;  // ❌ starts with digit
my-name;     // ❌ contains hyphen
user@host;   // ❌ contains @
```

## Case Sensitivity

DyGram identifiers are **case-sensitive**, except for node types:

```dygram
// These are different nodes
User;
user;
USER;
```

Node types are **case-insensitive**:
```dygram
// These are all equivalent
Task myTask;
task myTask;
TASK myTask;
```

## Simple Names

Simple identifiers are single words:

```dygram
start;
process;
validate;
complete;
```

## Qualified Names

Qualified names use dot notation to reference or define nodes hierarchically:

```dygram examples/syntax/node-qualified-ids.dygram
workflow.start -> workflow.process;
parent.child.grandchild;
```

### Referencing Nested Nodes

The primary use of qualified names is referencing nodes inside parents:

```dygram
Workflow {
    task Start;
    task Process;
    task Complete;
}

Init -> Workflow.Start;
Workflow.Start -> Workflow.Process;
Workflow.Process -> Workflow.Complete;
```

### Defining with Qualified Names

Nodes can be defined with qualified names for quick scaffolding:

```dygram
// Create implicit namespace structure
task API.Authentication "Auth handler";
task API.DataFetch "Data retrieval";
task API.Response "Response formatter";

Start -> API.Authentication -> API.DataFetch -> API.Response -> End;
```

### Deep Nesting

Qualified names support arbitrary depth:

```dygram
Level1.Level2.Level3.DeepNode;

Start -> Level1.Level2.Level3.DeepNode -> End;
```

## Scoping and Resolution

### Simple Name Resolution

Simple names resolve to nodes in the current or parent scope:

```dygram
Parent {
    Child1;
    Child2;
}

// Simple names work
Child1 -> Child2;
```

### Qualified Name Resolution

Qualified names provide unambiguous references:

```dygram
Group1 {
    task Step;
}

Group2 {
    task Step;  // Same simple name, different parent
}

// Qualified names disambiguate
Start -> Group1.Step;
Group1.Step -> Group2.Step;
```

### Conflict Resolution

When simple and qualified names overlap, both remain accessible:

```dygram
Group {
    task Child "Simple child";
    note Group.Child "Explicit qualified child";
}

// Both are accessible
Start -> Child;           // References simple child
Child -> Group.Child;     // References explicit qualified child
```

**Resolution Strategy:**
- **Explicit names always win** over implicit aliases
- Simple nodes get both simple and qualified aliases (if no conflict)
- Qualified nodes get their explicit name plus simple shorthand (if no conflict)

For comprehensive details, see the [Qualified Names Guide](qualified-names.md).

## Reserved Words

DyGram has minimal reserved words. The following are used by the grammar:

- `machine` - Machine declaration keyword

To use reserved words as identifiers, they must appear in contexts where they're unambiguous (e.g., as node names).

## Naming Conventions

### Recommended Conventions

**Node Names:**
- Use **PascalCase** for node types and major nodes
- Use **camelCase** for general nodes
- Be **descriptive** and **concise**

```dygram
Task ProcessPayment;
State processingOrder;
Context userConfig;
```

**Attribute Names:**
- Use **camelCase** consistently
- Use **descriptive names**

```dygram
task myTask {
    maxRetries: 3;
    timeoutDuration: "30s";
    isEnabled: true;
};
```

**Qualified Names:**
- Use **PascalCase** for namespace segments
- Use **camelCase** for leaf nodes
- Keep hierarchy **2-3 levels** maximum

```dygram
API.Users.GetProfile;
Data.Cache.redis;
```

### Anti-patterns

Avoid these patterns:

```dygram
// ❌ Too generic
a;
temp;
data;

// ❌ Too long
thisIsAReallyLongNodeNameThatIsHardToRead;

// ❌ Inconsistent casing
MyNode;
my_other_node;
ANOTHER_NODE;

// ❌ Too deeply nested
System.API.Services.Users.Controllers.Handlers.GetProfile;
```

## Identifiers in Context

### Node Names

```dygram
// Simple
process;

// With type
Task process;

// Qualified
Workflow.process;
```

### Attribute Names

```dygram
task myTask {
    attributeName: "value";
    anotherAttribute: 42;
};
```

### Type Names

```dygram
task myTask {
    count<Integer>: 42;
    id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
};
```

### Annotation Names

```dygram
Task myTask @Critical @Version("1.0");
```

## Best Practices

### Be Descriptive
```dygram
// ✅ Good
authenticateUser;
validatePayment;
processOrder;

// ❌ Bad
auth;
val;
proc;
```

### Be Consistent
```dygram
// ✅ Good - consistent camelCase
getUserProfile;
updateUserSettings;
deleteUserAccount;

// ❌ Bad - mixed styles
GetUserProfile;
update_user_settings;
DELETEUSERACCOUNT;
```

### Use Qualified Names for Organization
```dygram
// ✅ Good - clear organization
Auth.Login;
Auth.Logout;
Data.Fetch;
Data.Store;

// ❌ Bad - flat namespace
AuthLogin;
AuthLogout;
DataFetch;
DataStore;
```

### Avoid Over-nesting
```dygram
// ✅ Good - 2-3 levels
API.Users.GetProfile;

// ⚠️ Avoid - too deep
System.API.V1.Services.Users.Handlers.GetProfile;
```

## Examples

### Simple Workflow
```dygram
start;
validate;
process;
complete;

start -> validate -> process -> complete;
```

### Organized with Qualified Names
```dygram
// Clear namespace organization
Auth.Login;
Auth.Register;
Auth.Verify;

Data.Fetch;
Data.Transform;
Data.Store;

UI.LoginForm;
UI.Dashboard;

// Clear relationships
UI.LoginForm -> Auth.Login -> UI.Dashboard;
UI.Dashboard -> Data.Fetch -> Data.Transform -> Data.Store;
```

### Mixed Simple and Qualified
```dygram
// Global nodes
Start;
End;

// Namespaced workflow
Workflow {
    task Validate "Validation step";
    task Process "Processing step";
    task Complete "Completion step";
}

// Mix both styles
Start -> Workflow.Validate;
Workflow.Validate -> Workflow.Process;
Workflow.Process -> Workflow.Complete;
Workflow.Complete -> End;
```

### Collision Handling
```dygram
Parent {
    // Simple node
    task Process "Parent's process";

    // Explicitly qualified node
    note Parent.Process "Documentation for qualified process";
}

// Both accessible
Start -> Process;              // Simple child
Process -> Parent.Process;     // Qualified child
```

## See Also

- [Qualified Names](qualified-names.md) - Comprehensive guide to dot notation
- [Nodes](nodes.md) - Node naming and definition
- [Attributes](attributes.md) - Attribute naming
- [Types](types.md) - Type naming
- [Annotations](annotations.md) - Annotation naming
