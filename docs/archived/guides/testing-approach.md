# DyGram Testing Approach


Comprehensive guide to the generative testing methodology used to validate DyGram.

## Philosophy

Rather than static test cases, DyGram uses **generative testing** to validate language completeness and transformation losslessness. This approach:

- **Generates diverse examples** programmatically instead of hand-writing test cases
- **Validates actual output** (Mermaid diagrams, JSON) instead of just checking for errors
- **Discovers edge cases** that static tests miss
- **Creates inspection artifacts** for manual review

This methodology was developed after discovering that 109 static tests missed critical bugs that 23 generative tests found.

## Test Pipeline

Each test validates the complete transformation pipeline:

```
DyGram source → Parser → AST → Generator → JSON
                                        ↓
                                   Generator → Mermaid
```

### Validation Steps

1. **Parse Validation**
   - No parser errors
   - No lexer errors
   - AST structure is correct

2. **Completeness Validation**
   - All nodes from source appear in JSON
   - All edges from source appear in JSON
   - No information lost during parsing

3. **Losslessness Validation**
   - Machine title preserved in Mermaid output
   - All nodes appear in Mermaid output
   - Edge labels preserved in Mermaid output

4. **Mermaid Validation**
   - Output is valid Mermaid syntax
   - Structural elements present (classDiagram-v2, nodes, edges)

## Example Categories

Tests are organized by language feature:

### Basic Syntax
- Minimal machines
- Simple node declarations
- Typed nodes (task, state, init, context)
- Node labels

**Examples:** `examples/basic/*.dygram`

### Attributes
- Typed attributes (string, number, boolean, array)
- Untyped attributes
- Complex attribute values
- Multiple attributes per node

**Examples:** `examples/attributes/*.dygram`

### Edges
- Basic edges
- Arrow type variants (→, -->, =>, bidirectional)
- Edge labels (simple, quoted, with attributes)
- Chained edges

**Examples:** `examples/edges/*.dygram`

### Nesting
- Multiple levels of hierarchy
- Mixed nesting patterns
- Deep nesting (5+ levels)

**Examples:** `examples/nesting/*.dygram`

### Complex Features
- Context definitions
- Workflows
- Conditional edges
- Unicode support

**Examples:** `examples/complex/*.dygram`

### Stress Tests
- Large machines (50+ nodes)
- Many edges and cross-connections
- Performance validation

**Examples:** `examples/stress/*.dygram`

### Edge Cases
- Special characters in identifiers
- Empty nodes
- Multiple edges from single node
- Boundary conditions

**Examples:** `examples/edge-cases/*.dygram`

## Test Implementation

Tests are implemented in `test/integration/generative.test.ts`:

```typescript
test('Basic: Minimal Machine', async () => {
    const source = fs.readFileSync('examples/basic/minimal.dygram', 'utf-8');
    const result = await runGenerativeTest('Minimal Machine', source);
    expect(result.passed).toBe(true);
});
```

Each test:
1. Loads source from example file
2. Parses to AST
3. Generates JSON and Mermaid
4. Validates completeness and losslessness
5. Records results for reporting

## Test Artifacts

Each test run generates artifacts in `test-output/generative/`:

### Individual Test Files
Each test creates `{test-name}.md` with:
- Source DyGram code
- Generated JSON
- Generated Mermaid diagram
- Validation results

### Comprehensive Report
`REPORT.md` contains:
- Summary statistics (passed/failed/success rate)
- Issue summary by type
- Detailed failure analysis
- All validation errors

## Bugs Found by Generative Testing

### 1. Deep Nesting Bug (CRITICAL)
**Location:** `src/language/generator/generator.ts:75-92`

**Issue:** JSON generator only handled 2 levels of nesting, losing grandchildren (3+ levels)

**Example:**

```dy
level1 {
    level2 {
        level3;  // This was being lost!
    }
}
```

**Fix:** Made `serializeNodes()` recursive to handle arbitrary nesting depth

### 2. Edge Label Loss in Mermaid (IMPORTANT)
**Location:** `src/language/generator/generator.ts:120-140`

**Issue:** Edge labels captured in JSON but not rendered in Mermaid diagrams

**Example:** `start -init-> middle` was not showing "init" label in output

**Fix:** Added `value` field alongside `attributes` for compatibility

## Test Statistics

Current test coverage:
- **35 generative tests** covering all language features
- **100% success rate** after bug fixes
- **Validates:** Parsing, JSON generation, Mermaid generation, completeness, losslessness

## Snapshot Testing

In addition to structural validation, the test suite now includes **snapshot testing** to detect unintended changes in output generation.

### How Snapshot Testing Works

Snapshots capture the expected outputs (JSON, Graphviz DOT, and SVG) for each test example:

1. **Baseline Creation**: Initial snapshots are created when tests first run
2. **Comparison**: Subsequent test runs compare current outputs against stored snapshots
3. **Failure on Mismatch**: Tests fail if outputs differ from snapshots
4. **Intentional Updates**: Snapshots can be updated when changes are intentional

### Running Tests

**Normal Mode (Snapshot Comparison):**
```bash
npm test
```
Tests fail if outputs differ from snapshots. This is the default CI/CD mode.

**Update Mode (Create/Update Snapshots):**
```bash
UPDATE_SNAPSHOTS=true npm test
```
Creates new snapshots or updates existing ones when differences are detected.

### When to Update Snapshots

Update snapshots in these situations:
- **Intentional generator changes**: You've improved the JSON/Graphviz generator
- **New examples**: You've added new examples to the documentation
- **Fixed bugs**: You've fixed a bug and the corrected output is now expected
- **Library updates**: You've updated dependencies and verified new outputs are correct

### Snapshot Update Workflow

1. Make your changes to the generator or examples
2. Run tests to see what changed: `npm test`
3. Review detailed output in `test-output/comprehensive-generative/`
4. If changes are intentional, update snapshots: `UPDATE_SNAPSHOTS=true npm test`
5. Commit both code changes and updated snapshots

See `test/integration/__snapshots__/README.md` for detailed snapshot testing documentation.

Test output includes:
- Real-time validation results
- Generated artifacts in `test-output/generative/` and `test-output/comprehensive-generative/`
- Comprehensive report with statistics
- Snapshot comparison results

## Adding New Tests

To add a new test:

1. Create example file in appropriate category:

```bash
echo 'machine "New Feature"\\nnewNode;' > examples/basic/new-feature.dygram
```

2. Add test case in `test/integration/generative.test.ts`:

```typescript
test('Basic: New Feature', async () => {
    const source = fs.readFileSync('examples/basic/new-feature.dygram', 'utf-8');
    const result = await runGenerativeTest('New Feature', source);
    expect(result.passed).toBe(true);
});
```

3. Run tests and review artifacts:

```bash
npm test
cat test-output/generative/new_feature.md
```

## Best Practices

1. **Use real examples** - Test cases should represent actual usage patterns
2. **Validate output** - Always check generated JSON and Mermaid, not just absence of errors
3. **Create artifacts** - Generate inspection files for manual review
4. **Test edge cases** - Include boundary conditions and unusual patterns
5. **Document findings** - Record bugs found and fixes applied

## See Also

- [Syntax Guide](syntax-guide.html) - Language syntax reference
- [Examples Index](examples-index.html) - All test examples
- [Language Overview](language-overview.html) - Conceptual introduction


## Stress Testing

Large machine for performance and stress testing:

```dy examples/stress/large-50-nodes.dygram
machine "Large Machine"
node0 {
    id<number>: 0;
    name<string>: "Node 0";
}
node1;
node2;
node3;
node4;
node5 {
    id<number>: 5;
    name<string>: "Node 5";
}
node6;
node7;
node8;
node9;
node10 {
    id<number>: 10;
    name<string>: "Node 10";
}
node11;
node12;
node13;
node14;
node15 {
    id<number>: 15;
    name<string>: "Node 15";
}
node16;
node17;
node18;
node19;
node20 {
    id<number>: 20;
    name<string>: "Node 20";
}
node21;
node22;
node23;
node24;
node25 {
    id<number>: 25;
    name<string>: "Node 25";
}
node26;
node27;
node28;
node29;
node30 {
    id<number>: 30;
    name<string>: "Node 30";
}
node31;
node32;
node33;
node34;
node35 {
    id<number>: 35;
    name<string>: "Node 35";
}
node36;
node37;
node38;
node39;
node40 {
    id<number>: 40;
    name<string>: "Node 40";
}
node41;
node42;
node43;
node44;
node45 {
    id<number>: 45;
    name<string>: "Node 45";
}
node46;
node47;
node48;
node49;

node0 -> node1 -> node2 -> node3 -> node4 -> node5;
node5 -> node6 -> node7 -> node8 -> node9 -> node10;
node10 -> node11 -> node12 -> node13 -> node14 -> node15;
node15 -> node16 -> node17 -> node18 -> node19 -> node20;
node20 -> node21 -> node22 -> node23 -> node24 -> node25;
node25 -> node26 -> node27 -> node28 -> node29 -> node30;
node30 -> node31 -> node32 -> node33 -> node34 -> node35;
node35 -> node36 -> node37 -> node38 -> node39 -> node40;
node40 -> node41 -> node42 -> node43 -> node44 -> node45;
node45 -> node46 -> node47 -> node48 -> node49;
```

