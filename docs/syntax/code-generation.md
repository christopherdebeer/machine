# Code Generation with @code

DyGram supports generating executable TypeScript code for tasks using the `@code` annotation. This allows tasks to evolve from natural language prompts to efficient, type-safe code while maintaining LLM fallback capabilities.

## Table of Contents

- [Basic Usage](#basic-usage)
- [External References](#external-references)
- [Schema Validation](#schema-validation)
- [Code Storage](#code-storage)
- [LLM Fallback](#llm-fallback)
- [Regeneration](#regeneration)
- [CLI Commands](#cli-commands)
- [Examples](#examples)

## Basic Usage

Add the `@code` annotation to any task to enable code generation:

```dygram
@code
Task ValidateEmail {
    prompt: "Validate email format using regex";
    code: #ValidateEmail;
}
```

On first execution, DyGram will:
1. Generate TypeScript code based on the prompt
2. Save code to `<filename>.ValidateEmail.ts`
3. Execute the generated code
4. Fall back to LLM if code fails

## External References

The `code` attribute uses external reference syntax (`#identifier`) to specify where code is stored:

```dygram
@code
Task ProcessData {
    prompt: "Process input data and extract key fields";
    code: #ProcessData;
}
```

Generated file: `example.ProcessData.ts` (alongside `example.dygram`)

## Schema Validation

Define input and output schemas using JSON Schema to ensure type safety:

```dygram
@code
Task CalculateTotal {
    prompt: "Calculate total from items array";
    code: #CalculateTotal;
    schema: {
        input: {
            type: "object",
            properties: {
                items: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            price: { type: "number" },
                            quantity: { type: "number" }
                        },
                        required: ["price", "quantity"]
                    }
                }
            },
            required: ["items"]
        },
        output: {
            type: "object",
            properties: {
                total: { type: "number" },
                itemCount: { type: "number" }
            },
            required: ["total", "itemCount"]
        }
    };
}
```

### Schema Benefits

- **Type Safety**: Generated code includes proper TypeScript types
- **Validation**: Input/output validated against schemas at runtime
- **Auto-Regeneration**: Schema mismatches trigger code regeneration
- **Documentation**: Schemas serve as inline documentation

## Code Storage

Generated code is stored alongside your `.dygram` files:

```
my-project/
├── workflow.dygram
├── workflow.ValidateEmail.ts
├── workflow.ProcessData.ts
└── workflow.CalculateTotal.ts
```

### Benefits of External Storage

- **Version Control**: Code changes are visible in git diff
- **Review**: Generated code can be reviewed and modified
- **Debugging**: Easy to inspect and debug generated code
- **Reusability**: Code can be imported by other tasks

## LLM Fallback

If generated code fails, DyGram automatically falls back to LLM:

```dygram
@code
Task ExtractEntities {
    prompt: "Extract named entities from text";
    code: #ExtractEntities;
}
```

**Fallback triggers:**
- Code file doesn't exist (first run)
- Code throws runtime error
- Schema validation fails
- Low confidence score

**LLM will:**
1. Handle the task using natural language processing
2. Generate new code based on error
3. Save updated code for next execution

## Regeneration

Code is automatically regenerated when:

```dygram
@code
Task ClassifyText {
    prompt: "Classify text into categories";
    code: #ClassifyText;
    schema: {
        input: { type: "string" },
        output: {
            type: "object",
            properties: {
                category: { type: "string" },
                confidence: { type: "number" }
            },
            required: ["category", "confidence"]
        }
    };
}
```

**Triggers:**
- Runtime errors during code execution
- Schema validation failures
- Type mismatches

**Process:**
1. Capture error details
2. Include previous code as context
3. Generate improved version
4. Retry execution

## CLI Commands

Manage generated code using CLI commands:

### Check Code Status

```bash
dygram code-status workflow.dygram
```

Output:
```
📊 Code Generation Status: workflow.dygram

  ✓ ValidateEmail → workflow.ValidateEmail.ts
  ✓ ProcessData → workflow.ProcessData.ts
  ⚠ CalculateTotal → workflow.CalculateTotal.ts (not generated yet)
  ○ RegularTask (no @code annotation)
```

### Generate Code Manually

```bash
dygram generate-code workflow.dygram ValidateEmail
```

### Regenerate with Reason

```bash
dygram regenerate workflow.dygram ProcessData --reason "Fix type error in output"
```

### Show Generated Code

```bash
dygram show-code workflow.dygram ValidateEmail
```

## Examples

### Example: Email Validation

```dygram
machine "Email Validator"

@code
Task ValidateEmail {
    prompt: "Validate email format using regex pattern";
    code: #ValidateEmail;
    schema: {
        input: { type: "string" },
        output: { type: "boolean" }
    };
}

state Start "Enter email"
state Valid "Email is valid"
state Invalid "Email is invalid"

Start --> ValidateEmail
ValidateEmail --> Valid [when: "output === true"]
ValidateEmail --> Invalid [when: "output === false"]
```

Generated code (`example.ValidateEmail.ts`):
```typescript
export async function ValidateEmail(input: string): Promise<boolean> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(input);
}
```

### Example: Data Processing Pipeline

```dygram
machine "Data Pipeline"

@code
Task FetchData {
    prompt: "Fetch data from API endpoint";
    code: #FetchData;
    schema: {
        input: {
            type: "object",
            properties: {
                url: { type: "string" }
            }
        },
        output: {
            type: "object",
            properties: {
                data: { type: "array" }
            }
        }
    };
}

@code
Task TransformData {
    prompt: "Transform data by extracting key fields";
    code: #TransformData;
    schema: {
        input: {
            type: "object",
            properties: {
                data: { type: "array" }
            }
        },
        output: {
            type: "object",
            properties: {
                transformed: { type: "array" }
            }
        }
    };
}

@code
Task SaveResults {
    prompt: "Save results to database";
    code: #SaveResults;
    schema: {
        input: {
            type: "object",
            properties: {
                transformed: { type: "array" }
            }
        },
        output: {
            type: "object",
            properties: {
                saved: { type: "boolean" },
                count: { type: "number" }
            }
        }
    };
}

state Start "Begin pipeline"
state Success "Pipeline complete"

Start --> FetchData
FetchData --> TransformData
TransformData --> SaveResults
SaveResults --> Success
```

### Example: Content Moderation

```dygram
machine "Content Moderator"

@code
Task CheckProfanity {
    prompt: "Check text for profanity using word list";
    code: #CheckProfanity;
    schema: {
        input: { type: "string" },
        output: {
            type: "object",
            properties: {
                hasProfanity: { type: "boolean" },
                flaggedWords: {
                    type: "array",
                    items: { type: "string" }
                }
            },
            required: ["hasProfanity", "flaggedWords"]
        }
    };
}

@code
Task AnalyzeSentiment {
    prompt: "Analyze sentiment of text (positive/negative/neutral)";
    code: #AnalyzeSentiment;
    schema: {
        input: { type: "string" },
        output: {
            type: "object",
            properties: {
                sentiment: {
                    type: "string",
                    enum: ["positive", "negative", "neutral"]
                },
                score: {
                    type: "number",
                    minimum: -1,
                    maximum: 1
                }
            },
            required: ["sentiment", "score"]
        }
    };
}

Task ReviewContent {
    prompt: "Human review required for flagged content";
}

state Start "Submit content"
state Approved "Content approved"
state Rejected "Content rejected"
state Review "Awaiting review"

Start --> CheckProfanity

CheckProfanity --> AnalyzeSentiment [when: "hasProfanity === false"]
CheckProfanity --> Review [when: "hasProfanity === true"]

AnalyzeSentiment --> Approved [when: "sentiment !== 'negative'"]
AnalyzeSentiment --> Review [when: "sentiment === 'negative' && score < -0.7"]
AnalyzeSentiment --> Approved [when: "sentiment === 'negative' && score >= -0.7"]

Review --> ReviewContent
ReviewContent --> Approved
ReviewContent --> Rejected
```

### Example: Form Validation

```dygram
machine "User Registration"

@code
Task ValidateEmail {
    prompt: "Validate email format";
    code: #ValidateEmail;
    schema: {
        input: { type: "string" },
        output: { type: "boolean" }
    };
}

@code
Task ValidatePassword {
    prompt: "Validate password strength (min 8 chars, uppercase, lowercase, number)";
    code: #ValidatePassword;
    schema: {
        input: { type: "string" },
        output: {
            type: "object",
            properties: {
                valid: { type: "boolean" },
                errors: {
                    type: "array",
                    items: { type: "string" }
                }
            },
            required: ["valid", "errors"]
        }
    };
}

@code
Task CheckUsernameAvailable {
    prompt: "Check if username is available in database";
    code: #CheckUsernameAvailable;
    schema: {
        input: { type: "string" },
        output: { type: "boolean" }
    };
}

Task CreateAccount {
    prompt: "Create user account in database";
}

state Start "Enter registration info"
state EmailValid "Email validated"
state PasswordValid "Password validated"
state UsernameAvailable "Username available"
state Success "Account created"
state Error "Validation failed"

Start --> ValidateEmail
ValidateEmail --> EmailValid [when: "output === true"]
ValidateEmail --> Error [when: "output === false"]

EmailValid --> ValidatePassword
ValidatePassword --> PasswordValid [when: "valid === true"]
ValidatePassword --> Error [when: "valid === false"]

PasswordValid --> CheckUsernameAvailable
CheckUsernameAvailable --> UsernameAvailable [when: "output === true"]
CheckUsernameAvailable --> Error [when: "output === false"]

UsernameAvailable --> CreateAccount
CreateAccount --> Success
```

## Best Practices

### Write Clear Prompts

Good prompt:
```dygram
@code
Task ExtractPhoneNumber {
    prompt: "Extract phone number from text using regex. Support formats: (123) 456-7890, 123-456-7890, 1234567890";
    code: #ExtractPhoneNumber;
}
```

Poor prompt:
```dygram
@code
Task ExtractPhoneNumber {
    prompt: "Get phone number";  // Too vague
    code: #ExtractPhoneNumber;
}
```

### Define Comprehensive Schemas

Include all required fields and validation:
```dygram
schema: {
    input: {
        type: "object",
        properties: {
            text: { type: "string", minLength: 1 }
        },
        required: ["text"]
    },
    output: {
        type: "object",
        properties: {
            phoneNumber: { type: "string", pattern: "^\\d{10}$" },
            found: { type: "boolean" }
        },
        required: ["phoneNumber", "found"]
    }
}
```

### Use Descriptive External References

```dygram
code: #ValidateEmail;       // ✓ Clear and descriptive
code: #VE;                  // ✗ Too abbreviated
code: #task1;               // ✗ Not descriptive
```

### Review Generated Code

Always review generated code for:
- Security issues
- Performance problems
- Edge cases
- Error handling

### Commit Generated Code

Add generated `.ts` files to version control:
```bash
git add workflow.ValidateEmail.ts
git commit -m "Add generated code for ValidateEmail task"
```

## Troubleshooting

See [Code Generation Troubleshooting Guide](../development/code-generation-troubleshooting.md) for common issues and solutions.
