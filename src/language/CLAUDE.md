# Language Implementation Guidelines

## Grammar Development

The Langium grammar is in `src/language/machine.langium`:

```bash
# After grammar changes, regenerate parser
npm run langium:generate
```

## Key Components

- **Parser**: Generated from `.langium` grammar
- **Validator**: Custom validation rules in `src/language/validation/`
- **Linker**: Cross-reference resolution in `src/language/linking/`
- **Executor**: Runtime execution in `src/language/execution/`
- **Serializer**: JSON output in `src/language/json/`

## Validation Rules

Custom validators follow this pattern:

```typescript
export class MyValidator {
  @ValidationCheck(AstNodeType)
  checkSomething(node: AstNode, accept: ValidationAcceptor): void {
    if (/* condition */) {
      accept('error', 'Message', { node, property: 'propertyName' });
    }
  }
}
```

## Execution Semantics

Execution follows these phases:

1. **Parse** - Text → AST
2. **Link** - Resolve cross-references
3. **Validate** - Check semantic rules
4. **Execute** - Build runtime state, process steps

State management uses `StateBuilder` to construct execution context.

## Syntax Highlighting

TextMate and Monaco grammars are auto-generated from Langium grammar:

- `syntaxes/machine.tmLanguage.json` - VSCode/TextMate
- Generated Monaco tokenizer - Web playground

Regenerate after grammar changes with `npm run langium:generate`.

## Testing Language Changes

```bash
# Run language-specific tests
npm test -- test/language/
npm test -- test/parsing/
npm test -- test/validation/

# Update snapshots if behavior changed intentionally
UPDATE_SNAPSHOTS=true npm test
