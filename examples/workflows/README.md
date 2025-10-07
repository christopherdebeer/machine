# Workflow Examples

Real-world workflow examples demonstrating practical applications of the DyGram language.

## Examples

### `user-onboarding.dygram`
User registration and onboarding workflow with:
- Multiple states (registration, verification, profile setup)
- Timeout handling
- Cancellation flows
- Happy path and edge cases

**Test it:**
```bash
npx dygram generate examples/workflows/user-onboarding.dygram -f json,html -d output/
```

### `order-processing.dygram`
E-commerce order processing system with:
- Order lifecycle states
- Payment flow
- Fulfillment process
- Refund and cancellation handling

**Test it:**
```bash
npx dygram generate examples/workflows/order-processing.dygram -f mermaid -d output/
```

### `ci-cd-pipeline.dygram`
Continuous Integration/Deployment pipeline with:
- Build, test, and deploy stages
- Security scanning
- Multiple environments (staging, production)
- Failure handling and rollback paths

**Test it:**
```bash
npx dygram generate examples/workflows/ci-cd-pipeline.dygram -f html -d output/
# Open the generated HTML file to see the interactive visualization
```

## Usage Patterns

These examples demonstrate:
- **State management**: Using `State` nodes for workflow stages
- **Task execution**: Using `Task` nodes for actions
- **Edge labels**: Named transitions between states
- **Attributes**: Metadata like descriptions, timeouts, and priorities
- **Alternative flows**: Handling errors, timeouts, and edge cases

## Validation

Validate any workflow example:
```bash
npx dygram parseAndValidate examples/workflows/user-onboarding.dygram
```

## Generation Formats

Generate in multiple formats:
```bash
# JSON only (default)
npx dygram generate examples/workflows/user-onboarding.dygram

# Multiple formats
npx dygram generate examples/workflows/user-onboarding.dygram -f json,mermaid,html -d output/

# View the generated files
ls output/
```
