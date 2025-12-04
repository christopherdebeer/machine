# Types

DyGram supports a rich type system powered by Zod for runtime validation. Types can be used to annotate attributes, ensuring data integrity.

## Type Syntax

Types are specified using angle brackets after the attribute name:

```dy
attributeName<TypeName>: value;
```

## Primitive Types

### string
Text values:
```dy
name<string>: "John Doe";
description<string>: "A description";
```

### number
Numeric values (integers and floats):
```dy
machine "Example" {
    count<number>: 42;
    price<number>: 19.99;
    scientific<number>: 1.5e10;
    temperature<number>: -273.15;
}
```

### boolean
True or false values:
```dy
enabled<boolean>: true;
active<boolean>: false;
```

## Specialized String Types

### Date
ISO 8601 datetime strings. Must include time and timezone (Z format):

```dy
createdAt<Date>: "2025-10-22T13:30:00Z";
updatedAt<Date>: "2025-10-23T14:00:00Z";
```

**Valid formats:**
- `"2025-10-22T13:30:00Z"` ✅
- `"2025-10-22"` ❌ (missing time and timezone)

### UUID
UUID strings in standard format:

```dy
id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
userId<UUID>: "123e4567-e89b-12d3-a456-426614174000";
```

### URL
Valid URLs with protocol:

```dy
endpoint<URL>: "https://api.example.com";
homepage<URL>: "https://example.com/home";
```

**Valid formats:**
- `"https://example.com"` ✅
- `"http://example.com"` ✅
- `"example.com"` ❌ (missing protocol)

### Duration
ISO 8601 duration strings:

```dy
timeout<Duration>: "PT1H30M";
cacheTTL<Duration>: "P1D";
interval<Duration>: "PT30S";
```

**Format:**
- `P` prefix (required)
- Date part: `nYnMnD` (years, months, days)
- Time part: `TnHnMnS` (hours, minutes, seconds)

**Examples:**
- `"P1Y2M3D"` - 1 year, 2 months, 3 days
- `"PT4H5M6S"` - 4 hours, 5 minutes, 6 seconds
- `"P1DT12H"` - 1 day and 12 hours
- `"PT30S"` - 30 seconds

## Numeric Subtypes

### Integer
Integer numbers only (validated at runtime):

```dy
count<Integer>: 42;
retries<Integer>: 3;
```

**Valid values:**
- `42` ✅
- `-10` ✅
- `3.14` ❌ (float)

### Float
Floating-point numbers (alias for `number`):

```dy
price<Float>: 19.99;
temperature<Float>: 98.6;
```

## Generic Types

Generic types support parameterized validation.

### `Array<T>`

Arrays with validated element types:

```dy
tags<Array<string>>: ["api", "production"];
ports<Array<number>>: [8080, 8081, 8082];
```

**With specialized types:**
```dy examples/syntax/validated-generics.dygram
task myTask {
  // Array elements are validated as Dates
  dates<Array<Date>>: ["2025-10-22T13:30:00Z", "2025-10-23T14:00:00Z"];

  // Array elements are validated as Integers
  counts<Array<Integer>>: [1, 2, 3];
}
```

**Alias:** `List<T>` is equivalent to `Array<T>` (use backticks in code).

### `Map<K, V>`

Maps with typed keys and values:

```dy
config<Map<string, number>>: #configMap;
headers<Map<string, string>>: #httpHeaders;
```

Note: Map values are typically external references (`#ref`), as DyGram doesn't have object literal syntax.

### `Promise<T>`

Promise type (structural only, not validated at runtime):

```dy
result<Promise<Data>>: #asyncResult;
```

### `Result<T, E>`

Result type for success/error patterns (structural only):

```dy
outcome<Result<Data, Error>>: #computation;
```

## Type Validation

### Runtime Validation

Types are validated at runtime using Zod schemas:

```typescript
import { TypeChecker } from 'dygram';

const typeChecker = new TypeChecker(machine);
const errors = typeChecker.validate();

if (errors.length > 0) {
    console.error('Type errors:', errors);
}
```

### Validation Rules

- **Primitive types** validate basic JavaScript types
- **Specialized types** (Date, UUID, URL, Duration) validate string formats
- **Generic types** validate element types recursively
- **External references** (`#ref`) bypass validation (resolved at runtime)

## Node Types

**Any node can be used as a type.** This allows you to define structural types directly in your DyGram files without needing to register them programmatically.

### Basic Node Types

Define a node and use it as a type for attributes:

```dy
machine "Node Types Example"

Type User {
    id<string>;
    name<string>;
    email<string>;
}

Task process {
    currentUser<User>: {
        id: "123";
        name: "John";
        email: "john@example.com";
    };
}
```

**Any node keyword works**, not just `Type`:

```dy
machine "Any Node as Type"

Context Config {
    apiKey<string>;
    timeout<number>;
}

State Session {
    userId<string>;
    expiresAt<Date>;
}

Task authenticate {
    config<Config>: { apiKey: "secret"; timeout: 30; };
    session<Session>: {
        userId: "user123";
        expiresAt: "2025-10-31T12:00:00Z";
    };
}
```

### Union Types with Literals

Define union types using string literals with the pipe (`|`) operator:

```dy
Type Task {
    id<string>;
    status<'idle' | 'in_progress' | 'complete'>;
    priority<'low' | 'medium' | 'high'>;
}

Task myTask {
    item<Task>: {
        id: "task-1";
        status: "idle";
        priority: "high";
    };
}
```

Union types are validated at runtime - only the specified literal values are allowed.

### Node Types with Generics

Combine node types with generic types for powerful compositions:

```dy
Type Item {
    id<string>;
    value<number>;
}

Task processor {
    items<Array<Item>>: [
        { id: "1"; value: 100; },
        { id: "2"; value: 200; }
    ];

    itemMap<Map<string, Item>>: #itemRegistry;

    pendingItem<Promise<Item>>: #asyncFetch;
}
```

### Nested Node Types

Node types can reference other node types:

```dy
Type Address {
    street<string>;
    city<string>;
    zipCode<string>;
}

Type User {
    name<string>;
    email<string>;
    address<Address>;
}

Task userService {
    currentUser<User>: {
        name: "Alice";
        email: "alice@example.com";
        address: {
            street: "123 Main St";
            city: "Springfield";
            zipCode: "12345";
        };
    };
}
```

### How It Works

When you create a `TypeChecker`, all nodes in your machine are automatically registered as types:

```typescript
import { TypeChecker } from 'dygram';

const typeChecker = new TypeChecker(machine);

// All nodes are now available as types
console.log(typeChecker.isNodeType('User'));  // true
console.log(typeChecker.isNodeType('Config'));  // true
```

The type checker validates that values match the structure defined by the node:
- Checks that required attributes are present
- Validates attribute types recursively
- Supports nested node types and generics

## Custom Types

You can also register custom types programmatically using the TypeRegistry:

```typescript
import { z } from 'zod';

// Get the type registry from TypeChecker
const typeChecker = new TypeChecker(machine);
const registry = typeChecker.getTypeRegistry();

// Register a custom Email type
registry.register('Email', z.string().email());

// Register a custom SemVer type
registry.register('SemVer', z.string().regex(/^\d+\.\d+\.\d+$/));

// Register a custom Port type
registry.register('Port', z.number().int().min(1).max(65535));
```

Then use them in your DyGram files:

```dy
user {
  email<Email>: "user@example.com";
  version<SemVer>: "1.2.3";
  port<Port>: 8080;
}
```

## Type Inference

When types are omitted, DyGram infers types from values:

```dy
name: "John";        // inferred as string
count: 42;           // inferred as number
enabled: true;       // inferred as boolean
tags: ["a", "b"];    // inferred as Array<string>
```

For specialized types (Date, UUID, URL, Duration), explicit type annotations are required for validation.

## Best Practices

### When to Use Types
- **Always** annotate specialized types (Date, UUID, URL, Duration)
- **Consider** annotating arrays with element types for validation
- **Use** Integer type when whole numbers are required
- **Omit** types for obvious primitives (name: "string" doesn't need annotation)
- **Define** node types for reusable structural types in your domain

### When to Use Node Types
- **Define** common data structures once and reuse them (e.g., User, Config, Session)
- **Use** union types with literals for enumeration-like values (status, priority, etc.)
- **Combine** with generics for collections of structured data (`Array<User>`, `Map<string, Config>`)
- **Nest** node types to model complex hierarchical data
- **Prefer** node types over external references when the structure is known at design time

### Type Selection
- Use **`Date`** for timestamps, not plain strings
- Use **`UUID`** for unique identifiers
- Use **`URL`** for endpoints and links
- Use **`Duration`** for time intervals
- Use **`Integer`** for counts, indices, ports
- Use **`Float`** when decimals are explicitly required
- Use **node types** for structured domain objects
- Use **union types** for restricted string values

### Validation
- **Validate** at machine load time for early error detection
- **Handle** validation errors gracefully
- **Document** custom types in your application
- **Test** node type validation with various inputs

### External References
- Use for **runtime-resolved values**
- Use for **complex objects** not expressible in DyGram
- Use for **shared configuration**
- Prefer **node types** when structure is known and can be validated

## Examples

### Basic Types
```dy examples/syntax/types-built-in.dygram
task myTask {
  id<UUID>: "550e8400-e29b-41d4-a716-446655440000";
  createdAt<Date>: "2025-10-22T13:30:00Z";
  endpoint<URL>: "https://api.example.com";
  timeout<Duration>: "PT1H30M";
  count<Integer>: 42;
  price<Float>: 19.99;
}
```

### Generic Types
```dy examples/syntax/types-generic.dygram
results<Array<string>>: ["a", "b", "c"];
data<Map<string, number>>: #dataMap;
promise<Promise<Result>>: #pending;
```

### Validated Generics
```dy examples/syntax/validated-generics-b.dygram
task myTask {
  dates<Array<Date>>: ["2025-10-22T13:30:00Z", "2025-10-23T14:00:00Z"];
  counts<Array<Integer>>: [1, 2, 3];
}
```

### Complex Configuration
```dy
task apiClient {
    baseUrl<URL>: "https://api.example.com";
    timeout<Duration>: "PT30S";
    retries<Integer>: 3;
    endpoints<Array<URL>>: [
        "https://api.example.com/users",
        "https://api.example.com/posts"
    ];
    headers<Map<string, string>>: #defaultHeaders;
    createdAt<Date>: "2025-10-22T13:30:00Z";
};
```

### Custom Types (Programmatic)
```typescript
// Register custom types
const registry = typeChecker.getTypeRegistry();

registry.register('Email', z.string().email());
registry.register('PhoneNumber', z.string().regex(/^\+?[1-9]\d{1,14}$/));
registry.register('Percentage', z.number().min(0).max(100));
registry.register('HexColor', z.string().regex(/^#[0-9A-Fa-f]{6}$/));
```

```dy
user {
    email<Email>: "user@example.com";
    phone<PhoneNumber>: "+1234567890";
    completion<Percentage>: 75.5;
    themeColor<HexColor>: "#3B82F6";
};
```

### Node Types in Practice
```dy
machine "E-commerce System"

Type Product {
    id<UUID>;
    name<string>;
    price<Float>;
    inStock<boolean>;
    category<'electronics' | 'clothing' | 'books' | 'other'>;
}

Type CartItem {
    product<Product>;
    quantity<Integer>;
}

Type Order {
    id<UUID>;
    items<Array<CartItem>>;
    status<'pending' | 'processing' | 'shipped' | 'delivered'>;
    createdAt<Date>;
}

Task processOrder {
    order<Order>: {
        id: "550e8400-e29b-41d4-a716-446655440000";
        items: [
            {
                product: {
                    id: "123e4567-e89b-12d3-a456-426614174000";
                    name: "Laptop";
                    price: 999.99;
                    inStock: true;
                    category: "electronics";
                };
                quantity: 1;
            }
        ];
        status: "pending";
        createdAt: "2025-10-31T12:00:00Z";
    };
}
```

This example demonstrates:
- **Node types** (`Product`, `CartItem`, `Order`) as structural types
- **Union types** for restricted values (`category`, `status`)
- **Nested node types** (`CartItem` contains `Product`)
- **Generic types with node types** (`Array<CartItem>`)
- **Specialized types** (`UUID`, `Float`, `Integer`, `Date`)
- **Complete type safety** with runtime validation

## See Also

- [Attributes](attributes.md) - Using types in attributes
- [Nodes](nodes.md) - Typed node attributes
- [Edges](edges.md) - Typed edge attributes
- [Machines](machines.md) - Typed machine attributes
