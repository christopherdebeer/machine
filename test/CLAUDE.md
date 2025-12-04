# Testing Guidelines

## Test Organization

```
test/
├── integration/           # Comprehensive generative tests
│   └── __snapshots__/    # Golden snapshots
├── language/             # Language-specific tests
├── parsing/              # Parser tests
├── validation/           # Validator tests
├── linking/              # Linker tests
├── json/                 # Serializer tests
└── import-system/        # Import resolution tests
```

## Comprehensive Generative Testing

All examples in documentation are automatically tested:

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- test/integration/
npm test -- test/language/

# Update snapshots (when changes are intentional)
UPDATE_SNAPSHOTS=true npm test
```

## Snapshot Management

Golden snapshots track expected behavior:

- Located in `test/integration/__snapshots__/`
- Generated from examples in documentation
- Committed to repository
- Updated with `UPDATE_SNAPSHOTS=true npm test`

### When Snapshots Fail

1. **Review the diff** - Understand what changed
2. **Determine if intentional**:
   - If yes: `UPDATE_SNAPSHOTS=true npm test`
   - If no: Fix the code that caused the change
3. **Commit both code and snapshots together**

## Test Patterns

### Language Tests

Test parsing, validation, linking:

```typescript
describe('Feature', () => {
  it('should parse correctly', async () => {
    const result = await parseHelper.parse(`...`);
    expect(result.parseResult.parserErrors).toHaveLength(0);
  });
});
```

### Integration Tests

Test end-to-end behavior with snapshots:

```typescript
it('should match snapshot', async () => {
  const result = await processExample('example.dy');
  expect(result).toMatchSnapshot();
});
```

## Adding New Tests

1. Add test file in appropriate directory
2. Follow existing patterns
3. Run tests: `npm test`
4. Generate snapshots: `UPDATE_SNAPSHOTS=true npm test`
5. Commit test file and snapshots together

## Test Checklist

Before committing:

- [ ] All tests pass: `npm test`
- [ ] New tests added for new features
- [ ] Snapshots updated if behavior changed
- [ ] Test files and snapshots committed together
