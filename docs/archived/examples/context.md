# Context Management Examples

This directory contains examples demonstrating context nodes and context value management in DyGram.

## Examples

### `context-management.dy`
Enhanced context value management with storage and retrieval:
- Using `set_context_value` tool to store values dynamically
- Using `get_context_value` tool to retrieve stored values
- Type-safe context attribute management
- Context nodes as data stores during execution

### `template-variables.dy`
Template variable resolution and dynamic prompts:
- Using `{{nodeName.attributeName}}` syntax in prompts
- Dynamic value substitution during execution
- Automatic dependency inference from template variables
- Context-driven task execution

### `nested-access.dy`
Nested attribute access patterns:
- Multi-level context structures
- Dot notation for nested access: `{{context.level1.level2.attribute}}`
- Deep nesting (3+ levels)
- Type safety in nested structures
- Multiple context references in single task
- Organized configuration hierarchies

## Context Node Patterns

### Pattern 1: Configuration Storage

### Pattern 2: Dynamic Value Storage

### Pattern 3: Template Variable Usage

### Pattern 4: Nested Context

## Available Context Tools

When `meta: true` is set on a Task node, these tools become available:

- `set_context_value(nodeName, attributeName, value)` - Store values with type validation
- `get_context_value(nodeName, attributeName)` - Retrieve stored values
- `list_context_nodes()` - List all context nodes and their current values

## Best Practices

1. **Use Contexts for Configuration**: Store configuration values in context nodes
2. **Type Your Attributes**: Always specify types for better validation
3. **Use Template Variables**: Reference context values using `{{}}` syntax
4. **Organize Hierarchically**: Use nesting for related configuration
5. **Keep Nesting Shallow**: Limit nesting to 3-4 levels maximum
6. **Document Context Purpose**: Use clear names and notes to explain context usage

## See Also

- [Language Overview](../../docs/language-overview.md) - Context node documentation
- [Context & Schema Guide](../../docs/context-and-schema-guide.md) - Detailed context patterns
- [Advanced Features](../../docs/advanced-features.md) - Dependency inference

### `nested-access.dy`
Nested Attribute Access Patterns

```dy examples/context/nested-access.dygram
machine "Nested Attribute Access Patterns"

// This example demonstrates accessing nested attributes in context nodes
// using template variables and dot notation

// Pattern 1: Simple Nested Context
context appConfig {
    database {
        host<string>: "localhost";
        port<number>: 5432;
        name<string>: "myapp_db";
    }
    api {
        endpoint<string>: "https://api.example.com";
        timeout<number>: 5000;
        retries<number>: 3;
    }
}

task connectDatabase "Connect to Database" {
    // Access nested database configuration
    prompt: "Connect to database at {{appConfig.database.host}}:{{appConfig.database.port}}/{{appConfig.database.name}}";
}

task callAPI "Call API" {
    // Access nested API configuration
    prompt: "Call API at {{appConfig.api.endpoint}} with timeout {{appConfig.api.timeout}}ms and {{appConfig.api.retries}} retries";
}

connectDatabase --> appConfig;
callAPI --> appConfig;

// Pattern 2: Deep Nesting (3+ levels)
context systemConfig {
    services {
        authentication {
            oauth {
                clientId<string>: "client123";
                clientSecret<string>: "secret456";
                authUrl<string>: "https://auth.example.com/oauth";
            }
            jwt {
                secret<string>: "jwt_secret";
                expiresIn<number>: 3600;
            }
        }
        storage {
            s3 {
                bucket<string>: "my-bucket";
                region<string>: "us-east-1";
                accessKey<string>: "AKIAIOSFODNN7EXAMPLE";
            }
        }
    }
}

task authenticateUser "Authenticate User" {
    // Access deeply nested OAuth configuration
    prompt: "Authenticate using OAuth at {{systemConfig.services.authentication.oauth.authUrl}} with client {{systemConfig.services.authentication.oauth.clientId}}";
}

task uploadFile "Upload File" {
    // Access nested S3 configuration
    prompt: "Upload to S3 bucket {{systemConfig.services.storage.s3.bucket}} in {{systemConfig.services.storage.s3.region}}";
}

authenticateUser --> systemConfig;
uploadFile --> systemConfig;

// Pattern 3: Mixed Nesting with Arrays
context featureFlags {
    features {
        beta<Array<string>>: ["feature1", "feature2"];
        experimental<Array<string>>: ["feature3"];
    }
    users {
        admins<Array<string>>: ["admin1", "admin2"];
        betaTesters<Array<string>>: ["user1", "user2"];
    }
}

task checkFeatureAccess "Check Feature Access" {
    prompt: "Check if user has access to beta features: {{featureFlags.features.beta}}";
}

checkFeatureAccess --> featureFlags;

// Pattern 4: Multiple Context References
context userContext {
    profile {
        name<string>: "Alice";
        email<string>: "alice@example.com";
    }
    preferences {
        theme<string>: "dark";
        language<string>: "en";
    }
}

context appSettings {
    ui {
        defaultTheme<string>: "light";
        supportedLanguages<Array<string>>: ["en", "es", "fr"];
    }
}

task personalizeUI "Personalize UI" {
    // Access multiple nested contexts
    prompt: "Set up UI for {{userContext.profile.name}} with theme {{userContext.preferences.theme}} (default: {{appSettings.ui.defaultTheme}})";
}

personalizeUI --> userContext;
personalizeUI --> appSettings;

// Pattern 5: Conditional Access Based on Nested Values
init start "Start";
task checkConfig "Check Configuration" {
    prompt: "Validate configuration settings";
}
state configValid "Configuration Valid";
state configInvalid "Configuration Invalid";
task useDefaults "Use Default Configuration" {
    prompt: "Fall back to default configuration";
}
task proceed "Proceed with Task";
state complete "Complete";

start -> checkConfig;
checkConfig -"{{appConfig.database.host}} != null"-> configValid;
checkConfig -"{{appConfig.database.host}} == null"-> configInvalid;
configValid -> proceed;
configInvalid -> useDefaults;
useDefaults -> proceed;
proceed -> complete;

// Pattern 6: Nested Attributes in Task Definitions
task complexTask "Complex Task" {
    config {
        retry {
            maxAttempts<number>: 3;
            backoff<number>: 1000;
        }
        timeout {
            connect<number>: 5000;
            read<number>: 10000;
        }
    }
    metadata {
        version<string>: "1.0.0";
        author<string>: "System";
    }
}

// Pattern 7: Dynamic Path Resolution
context environment {
    development {
        apiUrl<string>: "http://localhost:3000";
        debugMode<boolean>: true;
    }
    production {
        apiUrl<string>: "https://api.production.com";
        debugMode<boolean>: false;
    }
    current<string>: "development";
}

task initEnvironment "Initialize Environment" {
    prompt: "Initialize with environment: {{environment.current}}";
}

task connectToAPI "Connect to API" {
    prompt: "Connect to API based on current environment configuration";
}

initEnvironment --> environment;
connectToAPI --> environment;

// Pattern 8: Nested Context with Type Safety
context typedConfig {
    database {
        connection {
            host<string>: "localhost";
            port<number>: 5432;
            ssl<boolean>: true;
        }
        pool {
            min<number>: 2;
            max<number>: 10;
            idleTimeout<number>: 10000;
        }
    }
}

task validateConnection "Validate Connection" {
    // Type-safe nested access
    prompt: "Validate connection to {{typedConfig.database.connection.host}}:{{typedConfig.database.connection.port}} with SSL: {{typedConfig.database.connection.ssl}}";
}

validateConnection --> typedConfig;

note appConfig "Nested context access uses dot notation:
{{contextName.level1.level2.attribute}}

Benefits:
- Organized configuration
- Clear hierarchy
- Type safety at each level
- Better maintainability"

note systemConfig "Deep nesting guidelines:
- Keep to 3-4 levels maximum
- Use meaningful names at each level
- Group related configuration together
- Consider flattening if too deep"

note personalizeUI "Multiple context references:
- Tasks can reference multiple contexts
- Each reference creates a dependency
- Dependencies are automatically inferred
- Visualized as dashed arrows in diagram"

note typedConfig "Type safety in nested structures:
- Types are enforced at each nesting level
- Template variables are type-checked
- Validation catches incorrect paths
- IDE/LSP provides autocomplete"

```

### `context-management.dy`

Enhanced Task Management with Context

```dy examples/context/context-management.mach
machine "Enhanced Task Management with Context"

state start;

Task generateHaiku {
  meta: true;
  prompt: "write a haiku about environment and store it in the output context using set_context_value tool";
};

context output {
  value<string>: "";
  metadata<object>: "{}";
};

Task processOutput {
  prompt: "read the haiku from output context using get_context_value and create a summary";
};

context summary {
  text<string>: "";
  wordCount<number>: 0;
};

state end;

start --> generateHaiku;
generateHaiku -stores-> output;
output --> processOutput;
processOutput -creates-> summary;
summary --> end;

```

### `template-variables.dy`

Template Variable Demo

```dy examples/context/template-variables.mach
machine "Template Variable Demo"

state start;

Task generateData {
  meta: true;
  prompt: "generate a random number between 1-100 and store it in the data context using set_context_value";
};

context data {
  number<number>: 0;
  processed<boolean>: false;
};

Task processData {
  prompt: "The number is {{data.number}}. Calculate its square and store the result in results context";
};

context results2 {
  original<number>: 0;
  squared<number>: 0;
  message<string>: "";
};

state end;

start --> generateData;
generateData -stores-> data;
data --> processData;
processData -calculates-> results2;
results2 --> end;

```
