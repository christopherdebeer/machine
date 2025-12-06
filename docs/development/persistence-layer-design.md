# DyGram Persistence Layer Design

**Date**: 2025-12-06
**Status**: Design Proposal
**Context**: Generic persistence mechanism to distinguish between ephemeral execution state and persistent machine data

---

## Executive Summary

DyGram currently lacks a mechanism for **persistent context** that survives across multiple executions. While execution state can be resumed within a single run (`.dygram/executions/`), there's no way to accumulate knowledge or maintain state across different execution sessions.

This design proposes a **generic persistence layer** using SQLite that:
- Distinguishes between ephemeral (execution-scoped) and persistent (machine-scoped) contexts
- Provides schema definition in DyGram syntax
- Supports ACE-style knowledge accumulation and similar use cases
- Maintains type safety and transaction consistency

---

## 1. Current State Analysis

### 1.1 DyGram's Existing Mechanisms

#### Execution State Persistence (`.dygram/executions/`)

**Location**: `src/cli/execution-state.ts`

**What it does**:
- Saves execution state for interactive CLI mode
- Enables resuming a single execution across multiple CLI invocations
- Structure:
  ```
  .dygram/executions/<execution-id>/
    ├── state.json      # Current node, paths, attributes
    ├── metadata.json   # Execution metadata (start time, turn count, etc.)
    ├── machine.json    # Machine snapshot
    └── history.jsonl   # Turn-by-turn history
  ```

**Scope**: Single execution only
**Lifecycle**: Cleaned up when execution completes

#### Context Manager (In-Memory)

**Location**: `src/language/execution/context-manager.ts`

**What it does**:
- Manages context node access with locking
- Stores context values in `MachineJSON.nodes[].attributes`
- Provides read/write operations with versioning
- Handles concurrent access across execution paths

**Persistence**: None - resets every execution
**Storage**: Memory only (within `MachineJSON` object)

### 1.2 ACE's Persistence Mechanism

**Location**: `/tmp/ace/ace/ace.py` (lines 817-825)

**What it does**:
- Saves playbooks as plain text files
- Each training run creates a results directory:
  ```
  results/ace_run_<timestamp>_<task>_<mode>/
    ├── final_playbook.txt
    ├── best_playbook.txt
    ├── intermediate_playbooks/
    │   ├── epoch_1_step_50_playbook.txt
    │   └── ...
    └── ...
  ```
- Loads previous playbook via `initial_playbook_path` parameter

**Scope**: Machine-level (survives across executions)
**Format**: Plain text with structured bullets

### 1.3 The Gap

| Feature | Execution State | Context Manager | ACE Playbooks | **Needed** |
|---------|----------------|-----------------|---------------|------------|
| **Survives across executions** | ✗ (single execution) | ✗ | ✓ | ✓ |
| **Structured schema** | ✗ | ✓ | ✗ | ✓ |
| **Type safety** | ✗ | ✓ | ✗ | ✓ |
| **Transaction consistency** | ✗ | ✗ | ✗ | ✓ |
| **Query capability** | ✗ | ✗ | ✗ | ✓ |
| **Version tracking** | ✗ | ✓ (in-memory) | ✗ | ✓ |

**The missing piece**: A generic persistence layer for machine-scoped, structured data that survives across executions.

---

## 2. Requirements

### 2.1 Functional Requirements

**FR1**: Support persistent contexts that survive across multiple executions
- Data written in execution N is available in execution N+1

**FR2**: Distinguish between ephemeral and persistent contexts in DSL
- Clear syntax to declare persistence intent
- Default should be ephemeral (backward compatible)

**FR3**: Provide schema definition for type safety
- Declare fields with types in DyGram syntax
- Support primitive types: `string`, `number`, `boolean`, `Date`
- Support complex types: `Array<T>`, `Object`, JSON

**FR4**: Support CRUD operations via edges
- `node -reads-> persistentContext`: Query data
- `node -writes-> persistentContext`: Insert/update data
- Transaction semantics for consistency

**FR5**: Enable query/filter capabilities
- Read specific fields
- Filter by conditions
- Aggregate data (count, sum, etc.)

### 2.2 Non-Functional Requirements

**NFR1**: **Machine-scoped storage**
- Each machine definition has its own database
- Database location: `.dygram/machines/<machine-hash>/data.db`
- Hash ensures different machines don't collide

**NFR2**: **Performance**
- SQLite for local, embedded database (no server needed)
- Indexed queries for common access patterns
- Connection pooling for concurrent access

**NFR3**: **Migration support**
- Schema versioning
- Automatic migration when schema changes
- Safe fallback if migration fails

**NFR4**: **Observability**
- Log persistence operations (with verbosity levels)
- Track schema migrations
- Export data for debugging

**NFR5**: **Backward compatibility**
- Existing machines continue to work (no persistence)
- Opt-in feature via explicit annotation

---

## 3. Design Proposal

### 3.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    DyGram Machine                       │
│                                                         │
│  context EphemeralContext {  context PersistentContext │
│    data: "temp";               @Persistent {           │
│  }                             schema: {                │
│                                  id: "number",          │
│  Task processData {              data: "string",        │
│    // uses in-memory             created: "Date"        │
│  }                             }                        │
│                              }                          │
│                                                         │
│  processData -writes-> PersistentContext;              │
└──────────────┬──────────────────────────────┬───────────┘
               │                              │
               v                              v
     ┌──────────────────┐          ┌──────────────────────┐
     │ ContextManager   │          │ PersistenceManager   │
     │  (in-memory)     │          │  (SQLite)            │
     └──────────────────┘          └──────────────────────┘
               │                              │
               v                              v
     ┌──────────────────┐          ┌──────────────────────┐
     │ MachineJSON      │          │ .dygram/machines/    │
     │  .nodes          │          │  <hash>/data.db      │
     │  .attributes     │          │                      │
     └──────────────────┘          └──────────────────────┘
```

### 3.2 Storage Location

**Database Path**:
```
.dygram/
  └── machines/
      └── <machine-hash>/
          ├── data.db           # SQLite database
          ├── schema.json       # Schema definition snapshot
          └── migrations.log    # Migration history
```

**Machine Hash Calculation**:
```typescript
function calculateMachineHash(machineJSON: MachineJSON): string {
    // Hash based on machine structure (nodes, edges)
    // NOT execution state or context values
    // Ensures same machine definition = same database
    const structural = {
        nodes: machineJSON.nodes.map(n => ({name: n.name, type: n.type})),
        edges: machineJSON.edges
    };
    return crypto.createHash('sha256')
        .update(JSON.stringify(structural))
        .digest('hex').substring(0, 16);
}
```

### 3.3 SQLite Schema Design

For each persistent context, create a table:

```sql
-- Example: PersistentContext becomes table 'PersistentContext'
CREATE TABLE IF NOT EXISTS PersistentContext (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,  -- Internal row ID
    _version INTEGER NOT NULL DEFAULT 1,    -- Row version
    _created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    _updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- User-defined fields (from schema)
    id INTEGER NOT NULL,
    data TEXT NOT NULL,
    created TEXT NOT NULL,  -- Date stored as ISO string

    -- Metadata
    _execution_id TEXT,  -- Which execution wrote this (optional tracking)
    _path_id TEXT        -- Which path wrote this (optional tracking)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_PersistentContext_id ON PersistentContext(id);

-- Version tracking table
CREATE TABLE IF NOT EXISTS _schema_versions (
    context_name TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    schema_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 DyGram Syntax Extensions

#### Basic Persistent Context

```dy
machine "Data Pipeline"

// Ephemeral context (current behavior, resets each execution)
context TempConfig {
    timeout: 5000;
    retries: 3;
}

// Persistent context (survives across executions)
context DataStore @Persistent {
    schema: {
        recordId<number>: 0;
        content<string>: "";
        processedAt<Date>: "2025-01-01T00:00:00Z";
        metadata<Object>: {};
    };
}

Task processData {
    prompt: "Process data and store results";
}

// Read from persistent storage
processData -reads-> DataStore;

// Write to persistent storage
processData -writes-> DataStore;
```

#### Advanced: Schema with Constraints

```dy
context UserProfiles @Persistent {
    schema: {
        userId<number>: 0;
        username<string>: "";
        email<string>: "";
        createdAt<Date>: "2025-01-01T00:00:00Z";
        loginCount<number>: 0;
        preferences<Object>: {};
    };

    // Constraints (future extension)
    unique: ["userId", "email"];
    index: ["username", "createdAt"];
}
```

#### ACE Playbook as Persistent Context

```dy
machine "ACE System"

// Playbook as persistent, evolving context
context Playbook @Persistent {
    schema: {
        bulletId<string>: "";
        section<string>: "";
        content<string>: "";
        helpful<number>: 0;
        harmful<number>: 0;
        createdAt<Date>: "2025-01-01T00:00:00Z";
        lastUsedAt<Date>: "2025-01-01T00:00:00Z";
    };

    index: ["section", "helpful", "harmful"];
}

Task Generator {
    prompt: "Generate answer using playbook bullets";
}

Task Reflector {
    prompt: "Analyze output and tag bullets";
}

Task Curator {
    meta: true;
    prompt: "Update playbook based on reflection";
}

// Generator reads from playbook
Generator -reads-> Playbook {
    filter: "helpful > harmful";  // Only helpful bullets
    orderBy: "helpful DESC";
    limit: 10;
};

// Reflector updates bullet counts
Reflector -writes-> Playbook {
    operation: "update";  // UPDATE vs INSERT
    match: "bulletId";
};

// Curator adds new bullets
Curator -writes-> Playbook {
    operation: "insert";
};
```

### 3.5 Read/Write Operations

#### Read Operation

When a node executes with `-reads->` to a persistent context:

```typescript
class PersistenceManager {
    async read(
        contextName: string,
        options?: {
            fields?: string[];        // SELECT specific fields
            filter?: string;          // WHERE clause (CEL expression)
            orderBy?: string;         // ORDER BY clause
            limit?: number;           // LIMIT
            offset?: number;          // OFFSET
        }
    ): Promise<any[]> {
        // 1. Get context schema
        const schema = this.getContextSchema(contextName);

        // 2. Build SQL query
        const query = this.buildSelectQuery(contextName, schema, options);

        // 3. Execute query
        const rows = await this.db.all(query);

        // 4. Deserialize based on schema types
        return rows.map(row => this.deserializeRow(row, schema));
    }
}
```

**Example SQL generation**:
```typescript
// DyGram:
Generator -reads-> Playbook { filter: "helpful > 3"; limit: 10; };

// Generates SQL:
SELECT * FROM Playbook
WHERE helpful > 3
ORDER BY _created_at DESC
LIMIT 10;
```

#### Write Operation

When a node executes with `-writes->` to a persistent context:

```typescript
class PersistenceManager {
    async write(
        contextName: string,
        data: Record<string, any>,
        options?: {
            operation?: 'insert' | 'update' | 'upsert';
            match?: string[];  // Fields to match for update/upsert
        }
    ): Promise<void> {
        // 1. Get context schema
        const schema = this.getContextSchema(contextName);

        // 2. Validate data against schema
        this.validateData(data, schema);

        // 3. Serialize based on schema types
        const serialized = this.serializeData(data, schema);

        // 4. Execute operation
        if (options?.operation === 'update') {
            await this.update(contextName, serialized, options.match);
        } else if (options?.operation === 'upsert') {
            await this.upsert(contextName, serialized, options.match);
        } else {
            await this.insert(contextName, serialized);
        }
    }

    private async insert(contextName: string, data: Record<string, any>): Promise<void> {
        const fields = Object.keys(data);
        const placeholders = fields.map(() => '?').join(', ');
        const values = Object.values(data);

        const sql = `INSERT INTO ${contextName} (${fields.join(', ')}) VALUES (${placeholders})`;
        await this.db.run(sql, values);
    }

    private async update(
        contextName: string,
        data: Record<string, any>,
        matchFields: string[]
    ): Promise<void> {
        const setFields = Object.keys(data).filter(k => !matchFields.includes(k));
        const setClause = setFields.map(f => `${f} = ?`).join(', ');
        const whereClause = matchFields.map(f => `${f} = ?`).join(' AND ');

        const setValues = setFields.map(f => data[f]);
        const whereValues = matchFields.map(f => data[f]);

        const sql = `UPDATE ${contextName} SET ${setClause}, _updated_at = CURRENT_TIMESTAMP WHERE ${whereClause}`;
        await this.db.run(sql, [...setValues, ...whereValues]);
    }
}
```

### 3.6 Type System Mapping

| DyGram Type | TypeScript Type | SQLite Type | Serialization |
|-------------|-----------------|-------------|---------------|
| `string` | `string` | `TEXT` | Direct |
| `number` | `number` | `INTEGER` or `REAL` | Direct |
| `boolean` | `boolean` | `INTEGER` | 0/1 |
| `Date` | `Date` | `TEXT` | ISO 8601 string |
| `Array<T>` | `T[]` | `TEXT` | JSON.stringify |
| `Object` | `Record<string, any>` | `TEXT` | JSON.stringify |
| `UUID` | `string` | `TEXT` | Direct (validated) |
| `Duration` | `number` | `INTEGER` | Milliseconds |

### 3.7 Schema Migration

When a persistent context schema changes:

```typescript
class PersistenceManager {
    async migrateSchema(
        contextName: string,
        oldSchema: Schema,
        newSchema: Schema
    ): Promise<void> {
        // 1. Detect changes
        const changes = this.detectSchemaChanges(oldSchema, newSchema);

        // 2. Generate migration SQL
        const migrations: string[] = [];

        for (const change of changes) {
            if (change.type === 'add_field') {
                migrations.push(
                    `ALTER TABLE ${contextName} ADD COLUMN ${change.field} ${change.sqlType} DEFAULT ${change.default}`
                );
            } else if (change.type === 'remove_field') {
                // SQLite doesn't support DROP COLUMN directly
                // Need to recreate table
                migrations.push(this.generateRecreateTable(contextName, newSchema));
            } else if (change.type === 'change_type') {
                // Also requires table recreation
                migrations.push(this.generateRecreateTable(contextName, newSchema));
            }
        }

        // 3. Execute migrations in transaction
        await this.db.exec('BEGIN TRANSACTION');
        try {
            for (const sql of migrations) {
                await this.db.exec(sql);
            }

            // Update schema version
            await this.updateSchemaVersion(contextName, newSchema);

            await this.db.exec('COMMIT');
        } catch (error) {
            await this.db.exec('ROLLBACK');
            throw new Error(`Schema migration failed: ${error}`);
        }

        // 4. Log migration
        await this.logMigration(contextName, oldSchema, newSchema, migrations);
    }
}
```

---

## 4. Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

**Goals**:
- SQLite integration
- Basic persistence manager
- Schema definition parsing

**Tasks**:
1. Add `better-sqlite3` dependency
2. Implement `PersistenceManager` class
3. Parse `@Persistent` annotation
4. Parse `schema` attribute
5. Create/open machine-specific database
6. Generate table schemas from DyGram definitions

**Deliverables**:
- `src/language/execution/persistence-manager.ts`
- `src/language/utils/schema-parser.ts`
- Basic read/write operations

### Phase 2: Read/Write Operations (Week 2)

**Goals**:
- Implement CRUD operations
- Type serialization/deserialization
- Transaction support

**Tasks**:
1. Implement `read()` with filtering, ordering, limits
2. Implement `write()` with insert/update/upsert
3. Type mapping and validation
4. CEL expression to SQL conversion (for filters)
5. Integration with ContextManager

**Deliverables**:
- Full CRUD API
- Type-safe serialization
- Unit tests

### Phase 3: Schema Migration (Week 3)

**Goals**:
- Automatic schema versioning
- Safe migrations
- Rollback support

**Tasks**:
1. Schema change detection
2. Migration SQL generation
3. Backup before migration
4. Migration logging
5. Error handling and rollback

**Deliverables**:
- Migration system
- Version tracking
- Migration tests

### Phase 4: CLI Integration (Week 4)

**Goals**:
- CLI commands for persistence management
- Debugging tools
- Export/import

**Tasks**:
1. `dygram db info <machine>` - Show database info
2. `dygram db query <machine> <context>` - Query data
3. `dygram db export <machine>` - Export to JSON
4. `dygram db import <machine>` - Import from JSON
5. `dygram db reset <machine>` - Clear database
6. `dygram db migrate <machine>` - Force migration

**Deliverables**:
- CLI commands
- Documentation
- Examples

### Phase 5: ACE Integration Example (Week 5)

**Goals**:
- Implement ACE as DyGram machine with persistence
- Validate design with real use case
- Performance testing

**Tasks**:
1. Define ACE playbook as persistent context
2. Implement Generator/Reflector/Curator tasks
3. Test on real dataset (e.g., finance tasks)
4. Benchmark performance vs. original ACE
5. Document example

**Deliverables**:
- `examples/ace/ace-playbook.dy`
- Performance comparison
- Tutorial documentation

---

## 5. Example: ACE as DyGram Machine

### 5.1 Complete ACE Implementation

```dy
machine "ACE: Agentic Context Engineering"

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

config {
    modelId: "claude-3-5-sonnet-20241022";
    maxReflectionRounds: 3;
    curatorFrequency: 1;
};

// ═══════════════════════════════════════════════════════════
// PERSISTENT PLAYBOOK STORAGE
// ═══════════════════════════════════════════════════════════

context Playbook @Persistent {
    schema: {
        // Identity
        bulletId<string>: "";              // [str-00001], [cal-00002], etc.
        section<string>: "";                // "strategies_insights", "formulas_calculations", etc.

        // Content
        content<string>: "";                // The actual advice/pattern

        // Tracking
        helpful<number>: 0;                 // Incremented when bullet helps
        harmful<number>: 0;                 // Incremented when bullet misleads

        // Metadata
        createdAt<Date>: "2025-01-01T00:00:00Z";
        lastUsedAt<Date>: "2025-01-01T00:00:00Z";
        usageCount<number>: 0;

        // Context
        taskContext<string>: "";            // What task prompted this bullet
        executionId<string>: "";            // Which execution created it
    };

    // Indexes for efficient querying
    index: ["section", "helpful", "harmful", "usageCount"];
    unique: ["bulletId"];
}

// ═══════════════════════════════════════════════════════════
// EPHEMERAL EXECUTION STATE
// ═══════════════════════════════════════════════════════════

context CurrentTask {
    question<string>: "";
    context<string>: "";
    target<string>: "";
    generatedAnswer<string>: "";
    isCorrect<boolean>: false;
    reflectionRounds<number>: 0;
    bulletsUsed<Array<string>>: [];
}

context CurationState {
    stepCount<number>: 0;
    shouldCurate<boolean>: false;
}

// ═══════════════════════════════════════════════════════════
// ACE AGENTS
// ═══════════════════════════════════════════════════════════

State StartTask @Entry;

Task Generator {
    modelId: "claude-3-5-sonnet-20241022";
    prompt: `
You are the Generator agent in the ACE system. Your role is to produce high-quality answers using accumulated playbook knowledge.

## Current Task
Question: {{ CurrentTask.question }}
Context: {{ CurrentTask.context }}

## Available Playbook Bullets
Below are the most helpful bullets from the playbook (helpful > harmful, sorted by effectiveness):

{{ PlaybookBullets }}

## Instructions
1. Review the playbook bullets carefully
2. Apply relevant strategies and patterns
3. Generate a comprehensive answer
4. Reference which bullets you used (by ID)

## Output Format
Provide your response in this format:
- **Answer**: [Your answer here]
- **Bullets Used**: [List of bullet IDs you referenced, e.g., str-00001, cal-00003]
    `;
}

Task Reflector {
    modelId: "claude-3-5-sonnet-20241022";
    prompt: `
You are the Reflector agent in the ACE system. Your role is to analyze outputs and tag playbook bullets as helpful or harmful.

## Task Details
Question: {{ CurrentTask.question }}
Generated Answer: {{ CurrentTask.generatedAnswer }}
Ground Truth: {{ CurrentTask.target }}
Correctness: {{ CurrentTask.isCorrect ? "CORRECT" : "INCORRECT" }}

## Bullets Used
{{ UsedBullets }}

## Instructions
1. Compare the generated answer to the ground truth
2. Identify which bullets helped or harmed the reasoning
3. Tag each bullet as "helpful", "harmful", or "neutral"
4. Extract new insights from this execution

## Output Format
{
    "bullet_tags": [
        {"bulletId": "str-00001", "tag": "helpful"},
        {"bulletId": "cal-00002", "tag": "harmful"}
    ],
    "new_insights": [
        {"section": "strategies_insights", "content": "New pattern discovered..."},
        {"section": "common_mistakes", "content": "Avoid this pitfall..."}
    ]
}
    `;
}

Task Curator {
    meta: true;  // Can modify persistence
    modelId: "claude-3-5-sonnet-20241022";
    prompt: `
You are the Curator agent in the ACE system. Your role is to update the playbook with new insights while managing redundancy.

## Current Playbook Stats
{{ PlaybookStats }}

## Recent Reflection
{{ ReflectionOutput }}

## Instructions
1. Review new insights from the Reflector
2. Check for duplicates or similar bullets
3. Decide whether to ADD, MERGE, or SKIP each insight
4. Generate unique bullet IDs for new bullets

## Output Format
{
    "operations": [
        {
            "type": "ADD",
            "section": "strategies_insights",
            "content": "New strategy to add"
        },
        {
            "type": "MERGE",
            "target_id": "str-00003",
            "source_ids": ["str-00005", "str-00012"],
            "merged_content": "Combined insight"
        }
    ]
}
    `;
}

// ═══════════════════════════════════════════════════════════
// EXECUTION FLOW
// ═══════════════════════════════════════════════════════════

State TaskReceived;
State AnswerGenerated;
State ReflectionComplete;
State CurationComplete;
State TaskComplete;

// Start task
StartTask -@auto-> TaskReceived;

// Generate answer (reads top helpful bullets from playbook)
TaskReceived -> Generator;

Generator -reads-> Playbook {
    filter: "helpful > harmful";
    orderBy: "helpful DESC, usageCount DESC";
    limit: 20;
};

Generator -reads-> CurrentTask;
Generator -writes-> CurrentTask {
    fields: ["generatedAnswer", "bulletsUsed"];
};

Generator -@auto-> AnswerGenerated;

// Reflect on answer
AnswerGenerated -> Reflector;

Reflector -reads-> CurrentTask;
Reflector -reads-> Playbook {
    filter: "bulletId IN CurrentTask.bulletsUsed";
};

// Update bullet counts based on reflection
Reflector -writes-> Playbook {
    operation: "update";
    match: ["bulletId"];
    fields: ["helpful", "harmful", "lastUsedAt", "usageCount"];
};

Reflector -@auto-> ReflectionComplete;

// Curate playbook (if needed)
ReflectionComplete -> Curator {
    condition: "CurationState.stepCount % config.curatorFrequency == 0";
};

// Curator adds new bullets
Curator -reads-> Playbook;  // Read current stats
Curator -writes-> Playbook {
    operation: "insert";
};

Curator -@auto-> CurationComplete;

// Alternative: Skip curation
ReflectionComplete -@auto-> TaskComplete {
    condition: "CurationState.stepCount % config.curatorFrequency != 0";
};

CurationComplete -@auto-> TaskComplete;

// Loop for incorrect answers (reflection rounds)
AnswerGenerated -> Generator {
    condition: "!CurrentTask.isCorrect && CurrentTask.reflectionRounds < config.maxReflectionRounds";
};

// ═══════════════════════════════════════════════════════════
// NOTES
// ═══════════════════════════════════════════════════════════

note Playbook "
The Playbook is a persistent context that accumulates knowledge across executions.
Each bullet has helpful/harmful counts that evolve based on Reflector feedback.
Bullets are queried by effectiveness (helpful > harmful) and sorted by usage.
";

note Generator "
Generator reads the most helpful bullets and uses them to produce answers.
It tracks which bullets were referenced for later reflection.
";

note Reflector "
Reflector analyzes output quality and tags bullets as helpful/harmful.
It also extracts new insights that the Curator can add to the playbook.
";

note Curator "
Curator updates the playbook with new insights while avoiding redundancy.
It runs periodically (every N steps) to manage playbook growth.
Meta-programming capability allows it to modify the persistent playbook.
";
```

### 5.2 Usage Example

**First Execution** (empty playbook):
```bash
# Run ACE on first task
dygram execute examples/ace/ace-playbook.dy \
    --input '{"question": "Calculate NPV", "context": "...", "target": "..."}' \
    --verbose

# Playbook database is created at:
# .dygram/machines/<hash>/data.db

# After execution, playbook contains initial bullets
dygram db query examples/ace/ace-playbook.dy Playbook

# Output:
# bulletId    | section              | content                          | helpful | harmful
# ------------|----------------------|----------------------------------|---------|--------
# str-00001   | strategies_insights  | Always verify data types         | 1       | 0
# cal-00001   | formulas_calculations| NPV = Σ(Cash Flow / (1+r)^t)   | 1       | 0
```

**Second Execution** (playbook persists):
```bash
# Run on second task - playbook is loaded automatically
dygram execute examples/ace/ace-playbook.dy \
    --input '{"question": "Calculate IRR", "context": "...", "target": "..."}' \
    --verbose

# Generator sees bullets from first execution!
# Bullets get updated based on effectiveness

dygram db query examples/ace/ace-playbook.dy Playbook

# Output:
# bulletId    | section              | content                          | helpful | harmful
# ------------|----------------------|----------------------------------|---------|--------
# str-00001   | strategies_insights  | Always verify data types         | 2       | 0
# cal-00001   | formulas_calculations| NPV = Σ(Cash Flow / (1+r)^t)   | 1       | 0
# cal-00002   | formulas_calculations| IRR: rate where NPV = 0         | 1       | 0
```

**After 100 Executions**:
```bash
# Playbook has accumulated substantial knowledge
dygram db query examples/ace/ace-playbook.dy Playbook \
    --filter "helpful > 5" \
    --order-by "helpful DESC" \
    --limit 10

# Top 10 most helpful bullets
# These get prioritized by Generator in future executions
```

### 5.3 Persistence Benefits for ACE

| Feature | Without Persistence | With Persistence |
|---------|-------------------|------------------|
| **Knowledge Accumulation** | ✗ Resets each run | ✓ Grows over time |
| **Bullet Tracking** | ✗ Manual save/load | ✓ Automatic |
| **Querying** | ✗ Text parsing | ✓ SQL queries |
| **Analytics** | ✗ Difficult | ✓ Easy (COUNT, AVG, etc.) |
| **Versioning** | ✗ File timestamps | ✓ Built-in versioning |
| **Concurrent Access** | ✗ File locks | ✓ Transaction support |

---

## 6. Advanced Features (Future)

### 6.1 Audit Trail

Track all changes to persistent contexts:

```sql
CREATE TABLE _audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    context_name TEXT NOT NULL,
    row_id INTEGER NOT NULL,
    operation TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
    old_values TEXT,          -- JSON snapshot before change
    new_values TEXT,          -- JSON snapshot after change
    execution_id TEXT,
    path_id TEXT,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 Time-Travel Queries

Query historical state:

```dy
Generator -reads-> Playbook {
    asOf: "2025-12-01T00:00:00Z";  // Query playbook state at specific time
};
```

### 6.3 Replication/Sync

Sync persistent contexts across machines:

```bash
# Export playbook from machine A
dygram db export machine-a.dy Playbook > playbook.json

# Import into machine B
dygram db import machine-b.dy Playbook < playbook.json
```

### 6.4 Backup/Restore

```bash
# Backup entire machine database
dygram db backup examples/ace/ace-playbook.dy --output ace-backup-2025-12-06.db

# Restore from backup
dygram db restore examples/ace/ace-playbook.dy --input ace-backup-2025-12-06.db
```

---

## 7. Migration Strategy

### 7.1 Backward Compatibility

**Existing machines without `@Persistent`**:
- Continue to work exactly as before
- No database created
- No persistence overhead

**Existing machines with execution state**:
- `.dygram/executions/` is separate from `.dygram/machines/`
- No conflicts
- Both systems coexist

### 7.2 Opt-In Model

Users must explicitly annotate contexts as `@Persistent`:

```dy
// Old: ephemeral (default)
context MyContext {
    data: "value";
}

// New: persistent (opt-in)
context MyContext @Persistent {
    schema: {
        data<string>: "value";
    };
}
```

### 7.3 Schema Evolution

When schema changes:

```dy
// Version 1
context Data @Persistent {
    schema: {
        name<string>: "";
    };
}

// Version 2 (add field)
context Data @Persistent {
    schema: {
        name<string>: "";
        email<string>: "";  // New field
    };
}
```

**Migration**:
1. Detect schema change on next execution
2. Prompt user: "Schema changed. Migrate? (y/n)"
3. If yes: Run migration (add column with default)
4. If no: Abort execution with clear error

---

## 8. Technical Considerations

### 8.1 Performance

**Optimization strategies**:
1. **Connection pooling**: Reuse SQLite connections
2. **Prepared statements**: Pre-compile frequent queries
3. **Batch writes**: Group multiple INSERTs into transactions
4. **Indexes**: Create indexes on commonly queried fields
5. **WAL mode**: Use Write-Ahead Logging for better concurrency

**Benchmarks** (target):
- Read 1000 rows: < 10ms
- Insert 100 rows (batch): < 50ms
- Complex query with JOIN: < 20ms

### 8.2 Concurrency

**SQLite limitations**:
- One writer at a time (EXCLUSIVE lock)
- Multiple readers allowed (SHARED lock)

**DyGram implications**:
- Multi-path execution: Fine for reads, serialized writes
- Interactive mode: No issues (single execution)
- Batch mode: Consider connection pooling

### 8.3 Size Limits

**SQLite limits**:
- Max database size: 281 TB (effectively unlimited)
- Max row size: ~1 GB (JSON fields can be large)
- Max table columns: 2000 (plenty for schema fields)

**Practical limits for DyGram**:
- Playbook bullets: Millions of rows feasible
- Context fields: Hundreds of fields per context

### 8.4 Security

**Considerations**:
1. **Local storage**: Database is local file, inherits filesystem permissions
2. **No authentication**: SQLite has no user authentication (file-level only)
3. **SQL injection**: Use parameterized queries exclusively
4. **Encryption**: Future extension - SQLite encryption extension (SQLCipher)

---

## 9. Comparison with Alternatives

### 9.1 File-Based Persistence (ACE's Approach)

| Aspect | File-Based | SQLite |
|--------|------------|--------|
| **Setup** | ✓ Simple | ✗ Requires library |
| **Querying** | ✗ Manual parsing | ✓ SQL queries |
| **Type Safety** | ✗ String manipulation | ✓ Schema enforcement |
| **Transactions** | ✗ No atomicity | ✓ ACID guarantees |
| **Concurrency** | ✗ File locking issues | ✓ Built-in |
| **Versioning** | ✗ Manual | ✓ Automatic |
| **Analytics** | ✗ Difficult | ✓ Native SQL |

### 9.2 External Database (PostgreSQL, MySQL)

| Aspect | External DB | SQLite |
|--------|-------------|--------|
| **Deployment** | ✗ Requires server | ✓ Embedded |
| **Performance** | ✓ High for scale | ✓✓ Excellent for local |
| **Concurrency** | ✓✓ Many writers | ✗ Single writer |
| **Portability** | ✗ Configuration needed | ✓ Single file |
| **Simplicity** | ✗ Complex setup | ✓ Zero config |

**Verdict**: SQLite is the right choice for DyGram's use case (local, embedded, simple).

### 9.3 JSON File with Append Log

| Aspect | JSON+Log | SQLite |
|--------|----------|--------|
| **Human Readable** | ✓✓ Easy to inspect | ✗ Binary format |
| **Querying** | ✗ Load entire file | ✓ Efficient queries |
| **Integrity** | ✗ Manual validation | ✓ Schema enforcement |
| **Compaction** | ✗ Manual | ✓ VACUUM |
| **Debugging** | ✓ Easy | ✓ (via CLI tools) |

---

## 10. Implementation Checklist

### Core Features
- [ ] `PersistenceManager` class
- [ ] SQLite integration (`better-sqlite3`)
- [ ] Schema parser (`@Persistent` annotation)
- [ ] Database creation/opening
- [ ] Table schema generation
- [ ] CRUD operations (read, write, update, delete)
- [ ] Type serialization/deserialization
- [ ] Transaction support
- [ ] Error handling

### Schema Management
- [ ] Schema versioning
- [ ] Migration detection
- [ ] Migration execution
- [ ] Rollback support
- [ ] Schema validation
- [ ] Migration logging

### CLI Tools
- [ ] `dygram db info` - Show database info
- [ ] `dygram db query` - Query data
- [ ] `dygram db export` - Export to JSON
- [ ] `dygram db import` - Import from JSON
- [ ] `dygram db reset` - Clear database
- [ ] `dygram db backup` - Backup database
- [ ] `dygram db restore` - Restore from backup
- [ ] `dygram db migrate` - Force migration

### Documentation
- [ ] Persistence design doc (this document)
- [ ] API reference
- [ ] Tutorial: Basic persistence
- [ ] Tutorial: ACE implementation
- [ ] Migration guide
- [ ] Troubleshooting guide

### Testing
- [ ] Unit tests (persistence-manager)
- [ ] Integration tests (full execution)
- [ ] Schema migration tests
- [ ] Concurrency tests
- [ ] Performance benchmarks
- [ ] ACE example validation

### Examples
- [ ] `examples/persistence/basic.dy` - Simple persistent counter
- [ ] `examples/persistence/crud.dy` - Full CRUD operations
- [ ] `examples/ace/ace-playbook.dy` - Complete ACE implementation
- [ ] `examples/persistence/analytics.dy` - Querying and aggregation

---

## 11. Open Questions

### Q1: Should we support relationships between persistent contexts?

**Example**:
```dy
context Users @Persistent {
    schema: {
        userId<number>: 0;
        username<string>: "";
    };
}

context Posts @Persistent {
    schema: {
        postId<number>: 0;
        authorId<number>: 0;  // Foreign key to Users.userId
        content<string>: "";
    };

    foreignKey: ["authorId" -> "Users.userId"];  // ???
}
```

**Pros**: More expressive, enables joins
**Cons**: Complexity, SQLite foreign keys have limitations
**Decision**: Defer to future extension, start simple

### Q2: How to handle large JSON fields?

**Scenario**: Playbook bullets with large metadata objects

**Options**:
1. Store as TEXT (JSON string) - simple but no querying inside
2. JSON1 extension - enables JSON queries (`json_extract()`)
3. Separate table for nested data - normalized but complex

**Decision**: Start with JSON strings, add JSON1 support later

### Q3: Should persistence be machine-scoped or file-scoped?

**Machine-scoped** (proposed):
- Database identified by machine structure hash
- Same database for all instances of the same machine
- Pro: Knowledge accumulates across different input files
- Con: Could cause confusion if same structure, different intent

**File-scoped**:
- Database identified by file path
- Different database for each .dy file
- Pro: Clear separation
- Con: Duplicates structure if files are identical

**Decision**: Machine-scoped (more powerful, matches ACE use case)

### Q4: How to handle database corruption?

**Strategies**:
1. Auto-backup before schema migration
2. PRAGMA integrity_check on open
3. Fallback to empty database if corrupted
4. Clear error messages with recovery steps

**Decision**: Implement all strategies with user control

---

## 12. Success Metrics

### Adoption
- [ ] 5+ example machines using `@Persistent`
- [ ] ACE implementation performs within 10% of original
- [ ] 90%+ backward compatibility (existing machines work)

### Performance
- [ ] Read 1000 rows < 10ms
- [ ] Insert 100 rows < 50ms
- [ ] Database size < 10MB for 100K bullets

### Developer Experience
- [ ] Schema definition takes < 5 lines
- [ ] No boilerplate for read/write
- [ ] Clear error messages for schema issues
- [ ] CLI tools cover 80% of debugging needs

---

## 13. Conclusion

This design proposes a **generic persistence layer** for DyGram that:

1. **Solves the ACE use case**: Playbooks can evolve across executions
2. **Generic and reusable**: Any machine can use `@Persistent` contexts
3. **Type-safe**: Schema enforcement prevents runtime errors
4. **Backward compatible**: Existing machines continue to work
5. **Simple to use**: Minimal syntax extensions, automatic database management
6. **Powerful**: Full SQL querying, transactions, migrations

**Next Steps**:
1. Review this design with stakeholders
2. Prototype Phase 1 (core infrastructure)
3. Validate with ACE example
4. Iterate based on feedback
5. Implement full feature set

**Key Design Principles**:
- **Opt-in**: Persistence is explicit, not default
- **Zero-config**: Database creation is automatic
- **Type-safe**: Schema definitions prevent errors
- **Machine-scoped**: Knowledge accumulates across executions
- **SQLite**: Right tool for embedded, local persistence

---

**Document Version**: 1.0
**Last Updated**: 2025-12-06
**Status**: Design Proposal (pending review)
**Author**: Claude (DyGram Development)
