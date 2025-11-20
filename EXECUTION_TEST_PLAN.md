# Execution/Runtime Test Plan

## Overview

This document outlines a comprehensive test suite for DyGram execution runtime, focusing on **conditional edges**, **context propagation**, and **state transitions** WITHOUT LLM integration. Tests are designed as CLI-based integration tests with log output analysis.

## Test Categories

### 1. Conditional Edge Evaluation
### 2. Context Propagation & Attribute Access
### 3. State Transitions & Flow Control
### 4. Error Handling & Edge Cases

---

## Test Suite Design

### Test Structure

Each test consists of:
1. **Machine Definition** (`.dy` file)
2. **Test Script** (bash/node runner)
3. **Expected Output** (assertions on logs/state)
4. **Success Criteria** (exit code, log patterns, final state)

### Execution Pattern

```bash
# Generate JSON
dygram generate test-machine.dy -f json -d /tmp

# Execute (if execute command supports non-LLM mode)
dygram execute /tmp/test-machine.json --no-llm --debug > /tmp/output.log 2>&1

# Analyze output
grep "SUCCESS_MARKER" /tmp/output.log
check_exit_code $?
```

---

## Category 1: Conditional Edge Evaluation

### Test 1.1: Simple When Condition (True Path)

**File:** `test/fixtures/execution/conditional-when-true.dy`

```dygram
machine "Conditional When True" {
    status: "valid";
}

state Start "Start Node" @start
state Success "Success Path"
state Failure "Failure Path"

Start -when: status == "valid"-> Success
Start -when: status == "invalid"-> Failure
```

**Test Script:** `test/execution/run-conditional-when-true.sh`
```bash
#!/bin/bash
set -e

# Generate JSON
node dist/cli/main.js generate test/fixtures/execution/conditional-when-true.dy \
    -f json -d /tmp

# Check JSON contains conditions
grep -q '"when"' /tmp/conditional-when-true.json || exit 1

# Parse and validate (should pass)
node dist/cli/main.js parseAndValidate test/fixtures/execution/conditional-when-true.dy

echo "✓ Test 1.1 passed: When condition (true path) validated"
```

**Expected:**
- ✅ JSON contains `when` property on edges
- ✅ Parse/validate passes without errors
- ✅ Edge from Start → Success should be marked as active
- ✅ Edge from Start → Failure should be marked as inactive

---

### Test 1.2: Simple Unless Condition (False Path)

**File:** `test/fixtures/execution/conditional-unless-false.dy`

```dygram
machine "Conditional Unless False" {
    errorCount: 3;
}

state Start "Start Node" @start
state Continue "Continue Processing"
state Stop "Stop on Error"

Start -unless: errorCount > 0-> Continue
Start -when: errorCount > 0-> Stop
```

**Expected:**
- ✅ Unless condition evaluates correctly
- ✅ Edge to Stop should be active (errorCount=3 > 0)
- ✅ Edge to Continue should be inactive

---

### Test 1.3: Multiple Conditions with Priority

**File:** `test/fixtures/execution/conditional-priority.dy`

```dygram
machine "Conditional Priority" {
    priority: 5;
    urgent: true;
}

state Start @start
state HighPriority
state NormalPriority
state LowPriority

Start -when: urgent == true-> HighPriority
Start -when: priority > 7-> HighPriority
Start -when: priority >= 3-> NormalPriority
Start -> LowPriority
```

**Expected:**
- ✅ Multiple when conditions evaluated in order
- ✅ First matching condition taken (urgent==true → HighPriority)
- ✅ Lower priority edges ignored when higher priority matches

---

### Test 1.4: Complex Boolean Expressions

**File:** `test/fixtures/execution/conditional-complex.dy`

```dygram
machine "Complex Conditions" {
    count: 15;
    enabled: true;
    status: "ready";
}

state Start @start
state PathA
state PathB
state PathC

Start -when: (count > 10 && enabled == true)-> PathA
Start -when: (status == "ready" || status == "pending")-> PathB
Start -unless: (count < 5)-> PathC
```

**Expected:**
- ✅ AND logic: `count > 10 && enabled == true` → PathA (active)
- ✅ OR logic: `status == "ready" || status == "pending"` → PathB (active)
- ✅ Unless with comparison: `count < 5` is false, so PathC edge active

---

## Category 2: Context Propagation

### Test 2.1: Context Node Attribute Access

**File:** `test/fixtures/execution/context-access.dy`

```dygram
machine "Context Access"

context Config {
    apiUrl: "https://api.example.com";
    timeout: 5000;
}

task Start @start {
    description: "Start with {{ Config.apiUrl }}";
}

task Process {
    description: "Timeout is {{ Config.timeout }}ms";
}

Start -> Process
```

**Test Script:**
```bash
#!/bin/bash
# Generate JSON
node dist/cli/main.js generate test/fixtures/execution/context-access.dy -f json -d /tmp

# Check JSON contains attribute references
cat /tmp/context-access.json | jq '.nodes[] | select(.name=="Start") | .attributes[] | select(.name=="description")'

# Verify template syntax preserved
grep -q "Config.apiUrl" /tmp/context-access.json && echo "✓ Template preserved"
```

**Expected:**
- ✅ Context attributes accessible via qualified names
- ✅ Template variables preserved in JSON output
- ✅ No CEL evaluation errors during generation

---

### Test 2.2: Nested Context Access

**File:** `test/fixtures/execution/nested-context.dy`

```dygram
machine "Nested Context"

context Database {
    host: "localhost";
    port: 5432;
}

context Settings {
    env: "production";
    database: Database;
}

task Start @start {
    connectionString: "{{ Settings.database.host }}:{{ Settings.database.port }}";
}
```

**Expected:**
- ✅ Nested attribute access works: `Settings.database.host`
- ✅ Dot notation correctly resolves nested contexts

---

### Test 2.3: Context in Conditions

**File:** `test/fixtures/execution/context-in-conditions.dy`

```dygram
machine "Context in Conditions"

context Settings {
    debugMode: true;
    maxRetries: 3;
}

state Start @start
state DebugPath
state ProductionPath

Start -when: Settings.debugMode == true-> DebugPath
Start -unless: Settings.debugMode-> ProductionPath
```

**Expected:**
- ✅ Context attributes usable in conditional expressions
- ✅ Boolean context attributes evaluate correctly

---

## Category 3: State Transitions

### Test 3.1: Auto-transition State Nodes

**File:** `test/fixtures/execution/auto-transition.dy`

```dygram
machine "Auto Transition"

state Start @start "Initial state"
state Ready "Ready state (auto-transitions)"
state Process "Processing state"
task Complete "Final task"

Start -> Ready
Ready -> Process
Process -> Complete
```

**Test Script:**
```bash
# Check node types
node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('/tmp/auto-transition.json', 'utf8'));
const stateNodes = json.nodes.filter(n => n.type === 'state');
console.log('State nodes:', stateNodes.map(n => n.name));
"
```

**Expected:**
- ✅ State nodes marked with `type: "state"`
- ✅ Auto-transition behavior documented
- ✅ Execution path: Start → Ready → Process → Complete

---

### Test 3.2: Conditional State Exit

**File:** `test/fixtures/execution/conditional-state-exit.dy`

```dygram
machine "Conditional State Exit" {
    validated: false;
}

state Start @start
state Validating
state SuccessPath
state ErrorPath

Start -> Validating
Validating -when: validated == true-> SuccessPath
Validating -when: validated == false-> ErrorPath
```

**Expected:**
- ✅ State can have multiple conditional exits
- ✅ Condition evaluated at state exit time
- ✅ validated=false → ErrorPath taken

---

### Test 3.3: Parallel Paths (Diamond Pattern)

**File:** `test/fixtures/execution/parallel-diamond.dy`

```dygram
machine "Parallel Diamond" {
    branchA: true;
    branchB: true;
}

state Start @start
state BranchA
state BranchB
state Merge

Start -when: branchA-> BranchA
Start -when: branchB-> BranchB
BranchA -> Merge
BranchB -> Merge
```

**Expected:**
- ✅ Multiple outgoing conditional edges from Start
- ✅ Both paths can be active simultaneously (parallel execution)
- ✅ Merge node receives from both branches

---

## Category 4: Error Handling

### Test 4.1: Missing Context Reference

**File:** `test/fixtures/execution/missing-context-error.dy`

```dygram
machine "Missing Context"

task Start @start {
    description: "{{ MissingContext.field }}";
}
```

**Test Script:**
```bash
# Should generate with warning
node dist/cli/main.js generate test/fixtures/execution/missing-context-error.dy \
    -f json -d /tmp 2>&1 | tee /tmp/error.log

# Check for warning (not error)
grep -q "Failed to resolve template variable" /tmp/error.log && echo "✓ Warning issued"

# Should still generate valid JSON
test -f /tmp/missing-context-error.json || exit 1
```

**Expected:**
- ⚠️ Warning: "Failed to resolve template variable: MissingContext.field"
- ✅ Generation succeeds with original template preserved
- ✅ JSON valid and parseable

---

### Test 4.2: Invalid Condition Syntax

**File:** `test/fixtures/execution/invalid-condition-syntax.dy`

```dygram
machine "Invalid Condition"

state Start @start
state Next

Start -when: this is not valid CEL syntax-> Next
```

**Expected:**
- ❌ Parse error or validation error
- ❌ Generation should fail or warn loudly
- 📝 Error message should indicate condition syntax issue

---

### Test 4.3: Circular Condition Loop

**File:** `test/fixtures/execution/circular-condition.dy`

```dygram
machine "Circular Loop" {
    loop: true;
}

state A @start
state B

A -when: loop-> B
B -when: loop-> A
```

**Expected:**
- ⚠️ Cycle detection warning
- ✅ Generation succeeds (cycles are valid in state machines)
- 📝 Execution should handle cycles with max step limits

---

## Test Implementation

### Test Runner Script

**File:** `test/execution/run-all-execution-tests.sh`

```bash
#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE_DIR="$SCRIPT_DIR/../fixtures/execution"
CLI="node dist/cli/main.js"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

passed=0
failed=0

run_test() {
    local test_name=$1
    local test_file=$2
    local test_script=$3

    echo "Running: $test_name"

    if [ -n "$test_script" ] && [ -f "$test_script" ]; then
        # Run custom test script
        if bash "$test_script"; then
            echo -e "${GREEN}✓${NC} $test_name PASSED"
            ((passed++))
        else
            echo -e "${RED}✗${NC} $test_name FAILED"
            ((failed++))
        fi
    else
        # Default: generate and validate
        if $CLI generate "$test_file" -f json -d /tmp && \
           $CLI parseAndValidate "$test_file"; then
            echo -e "${GREEN}✓${NC} $test_name PASSED"
            ((passed++))
        else
            echo -e "${RED}✗${NC} $test_name FAILED"
            ((failed++))
        fi
    fi
    echo ""
}

# Category 1: Conditional Edge Evaluation
echo "=== Category 1: Conditional Edge Evaluation ==="
run_test "1.1 When Condition (True)" \
    "$FIXTURE_DIR/conditional-when-true.dy" \
    "$SCRIPT_DIR/run-conditional-when-true.sh"

run_test "1.2 Unless Condition (False)" \
    "$FIXTURE_DIR/conditional-unless-false.dy"

run_test "1.3 Multiple Conditions with Priority" \
    "$FIXTURE_DIR/conditional-priority.dy"

run_test "1.4 Complex Boolean Expressions" \
    "$FIXTURE_DIR/conditional-complex.dy"

# Category 2: Context Propagation
echo "=== Category 2: Context Propagation ==="
run_test "2.1 Context Node Attribute Access" \
    "$FIXTURE_DIR/context-access.dy" \
    "$SCRIPT_DIR/run-context-access.sh"

run_test "2.2 Nested Context Access" \
    "$FIXTURE_DIR/nested-context.dy"

run_test "2.3 Context in Conditions" \
    "$FIXTURE_DIR/context-in-conditions.dy"

# Category 3: State Transitions
echo "=== Category 3: State Transitions ==="
run_test "3.1 Auto-transition State Nodes" \
    "$FIXTURE_DIR/auto-transition.dy"

run_test "3.2 Conditional State Exit" \
    "$FIXTURE_DIR/conditional-state-exit.dy"

run_test "3.3 Parallel Paths (Diamond)" \
    "$FIXTURE_DIR/parallel-diamond.dy"

# Category 4: Error Handling
echo "=== Category 4: Error Handling ==="
run_test "4.1 Missing Context Reference" \
    "$FIXTURE_DIR/missing-context-error.dy" \
    "$SCRIPT_DIR/run-missing-context.sh"

# Summary
echo "==================================="
echo "Test Results:"
echo -e "${GREEN}Passed: $passed${NC}"
echo -e "${RED}Failed: $failed${NC}"
echo "==================================="

if [ $failed -gt 0 ]; then
    exit 1
fi
```

**Usage:**
```bash
# Build first
npm run build

# Run all execution tests
bash test/execution/run-all-execution-tests.sh
```

---

## Test Fixtures Directory Structure

```
test/
├── fixtures/
│   └── execution/
│       ├── conditional-when-true.dy
│       ├── conditional-unless-false.dy
│       ├── conditional-priority.dy
│       ├── conditional-complex.dy
│       ├── context-access.dy
│       ├── nested-context.dy
│       ├── context-in-conditions.dy
│       ├── auto-transition.dy
│       ├── conditional-state-exit.dy
│       ├── parallel-diamond.dy
│       └── missing-context-error.dy
└── execution/
    ├── run-all-execution-tests.sh
    ├── run-conditional-when-true.sh
    ├── run-context-access.sh
    └── run-missing-context.sh
```

---

## Integration with Vitest

**File:** `test/integration/cli-execution.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

describe('CLI Execution Tests', () => {
    const fixtureDir = path.join(__dirname, '../fixtures/execution');
    const cli = 'node dist/cli/main.js';

    it('should generate JSON for conditional-when-true', () => {
        const fixture = path.join(fixtureDir, 'conditional-when-true.dy');
        const output = '/tmp/conditional-when-true.json';

        execSync(`${cli} generate ${fixture} -f json -d /tmp`);

        expect(fs.existsSync(output)).toBe(true);
        const json = JSON.parse(fs.readFileSync(output, 'utf-8'));
        expect(json.edges.some(e => e.when)).toBe(true);
    });

    it('should validate context-access', () => {
        const fixture = path.join(fixtureDir, 'context-access.dy');

        expect(() => {
            execSync(`${cli} parseAndValidate ${fixture}`, { stdio: 'pipe' });
        }).not.toThrow();
    });

    // Add more tests...
});
```

---

## Metrics to Track

### Success Criteria

| Test | Parse | Generate | Validate | Execute | Logs Correct |
|------|-------|----------|----------|---------|--------------|
| 1.1  | ✅    | ✅       | ✅       | N/A     | N/A          |
| 1.2  | ✅    | ✅       | ✅       | N/A     | N/A          |
| 2.1  | ✅    | ✅       | ✅       | N/A     | N/A          |
| 3.1  | ✅    | ✅       | ✅       | N/A     | N/A          |
| 4.1  | ✅    | ⚠️       | ✅       | N/A     | ✅           |

### Coverage Goals

- ✅ 100% conditional edge syntax coverage
- ✅ 100% context access patterns coverage
- ✅ 100% state transition types coverage
- ✅ 80% error condition coverage

---

## Future Extensions

### Phase 2: Mock LLM Execution
- Add mock LLM responses
- Test agent node execution
- Test prompt template rendering

### Phase 3: State Persistence
- Test checkpoint/restore
- Test state serialization
- Test history tracking

### Phase 4: Performance
- Large machine stress tests
- Deep nesting tests
- Cycle detection performance
