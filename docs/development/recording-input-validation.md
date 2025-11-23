# Recording Input Validation System

**Status**: Proposal
**Created**: 2025-11-23
**Issue**: Recordings are not validated against source file changes

## Problem Statement

Currently, DyGram test recordings do not validate that the source example file matches the file used when the recording was created. This creates several problems:

### Current Behavior

1. **Recording Creation** (Interactive Mode):
   - Test reads `examples/testing/tool-execution/simple-router.dy`
   - Parses file and creates machine
   - Agent makes intelligent decisions
   - Response is recorded to `test/fixtures/recordings/generative-tool-execution/simple-router/req-xxx.json`

2. **Recording Playback** (CI Mode):
   - Test reads `examples/testing/tool-execution/simple-router.dy`
   - Parses file and creates machine
   - **Loads recordings blindly** from directory
   - Replays responses in order

### Problems

1. **Stale Recordings**: If source file changes, recordings are still used
   ```
   # Before (recording created)
   start -"option_a"-> pathA
   start -"option_b"-> pathB

   # After (source file modified)
   start -"option_1"-> pathA  # Names changed!
   start -"option_2"-> pathB

   # Recording still has tools for "option_a" and "option_b"
   # But current machine expects "option_1" and "option_2"
   # → Test fails with confusing tool mismatch errors
   ```

2. **No Invalidation Detection**: No way to know when recordings need regeneration
   - Developer modifies example
   - CI uses old recordings
   - Test passes/fails with wrong expectations
   - No warning that recordings are stale

3. **Hard to Debug**: When tests fail, unclear if it's due to:
   - Code regression
   - Stale recordings
   - Intentional changes to examples

## Proposed Solution

### Phase 1: Add Source File Metadata to Recordings

Extend the recording format to include source file information:

```typescript
// Current recording format
interface Recording {
  request: LLMInvocationRequest;
  response: LLMInvocationResponse;
  recordedAt: string;
}

// Proposed recording format
interface RecordingWithMetadata {
  request: LLMInvocationRequest;
  response: LLMInvocationResponse;
  recordedAt: string;

  // NEW: Source file validation metadata
  sourceMetadata: {
    /** Path to source .dy file relative to project root */
    sourceFile: string;

    /** SHA-256 hash of source file content */
    contentHash: string;

    /** Size of source file in bytes */
    fileSize: number;

    /** Last modified timestamp of source file */
    lastModified: string;

    /** Optional: Parsed machine title for quick reference */
    machineTitle?: string;

    /** Optional: Key nodes for quick validation */
    nodeNames?: string[];

    /** Optional: Key edge labels for quick validation */
    edgeLabels?: string[];
  };

  // Optional: Track when recording was validated
  lastValidated?: string;
}
```

### Phase 2: Update Interactive Client to Capture Metadata

Modify `InteractiveTestClient.recordResponse()`:

```typescript
private async recordResponse(
    request: LLMInvocationRequest,
    response: LLMInvocationResponse,
    sourceFilePath?: string  // NEW parameter
): Promise<void> {
    const recording: any = {
        request,
        response,
        recordedAt: new Date().toISOString()
    };

    // NEW: Add source metadata if file path provided
    if (sourceFilePath) {
        recording.sourceMetadata = await this.computeSourceMetadata(sourceFilePath);
    }

    // ... rest of recording logic
}

private async computeSourceMetadata(filePath: string): Promise<SourceMetadata> {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const stats = await fs.promises.stat(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Parse machine for quick reference (optional but helpful)
    let machineTitle: string | undefined;
    let nodeNames: string[] | undefined;

    try {
        const services = createMachineServices(NodeFileSystem).Machine;
        const machine = await extractAstNodeForTests<Machine>(filePath, services);
        machineTitle = machine.title;
        nodeNames = machine.nodes?.map(n => n.name) || [];
    } catch (error) {
        console.warn('Could not parse machine for metadata:', error);
    }

    return {
        sourceFile: path.relative(process.cwd(), filePath),
        contentHash: hash,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        machineTitle,
        nodeNames
    };
}
```

### Phase 3: Update Playback Client to Validate Recordings

Modify `PlaybackTestClient` to validate before using recordings:

```typescript
export interface PlaybackTestConfig extends ClaudeClientConfig {
    recordingsDir: string;

    // NEW: Source file for validation
    sourceFile?: string;

    // NEW: Validation mode
    validationMode?: 'strict' | 'warn' | 'skip';

    // ... other config
}

class PlaybackTestClient {
    private validationErrors: string[] = [];

    private loadRecordings(): void {
        // ... existing load logic

        // NEW: Validate after loading if source file provided
        if (this.config.sourceFile && this.config.validationMode !== 'skip') {
            this.validateRecordings();
        }
    }

    private async validateRecordings(): Promise<void> {
        if (!this.config.sourceFile) {
            return;
        }

        const currentMetadata = await this.computeSourceMetadata(this.config.sourceFile);

        for (const recording of this.recordings) {
            if (!recording.sourceMetadata) {
                this.validationErrors.push(
                    `Recording ${recording.request.requestId} missing source metadata`
                );
                continue;
            }

            // Validate content hash
            if (recording.sourceMetadata.contentHash !== currentMetadata.contentHash) {
                const error = [
                    `Recording ${recording.request.requestId} has stale source file:`,
                    `  Expected hash: ${currentMetadata.contentHash}`,
                    `  Recorded hash: ${recording.sourceMetadata.contentHash}`,
                    `  Source file: ${currentMetadata.sourceFile}`,
                    `  Action: Regenerate recordings with DYGRAM_TEST_MODE=interactive`
                ].join('\n');

                this.validationErrors.push(error);
            }

            // Optional: Validate file path matches
            if (recording.sourceMetadata.sourceFile !== currentMetadata.sourceFile) {
                this.validationErrors.push(
                    `Recording source path mismatch: ${recording.sourceMetadata.sourceFile} vs ${currentMetadata.sourceFile}`
                );
            }
        }

        // Handle validation errors based on mode
        if (this.validationErrors.length > 0) {
            const errorMessage = [
                '❌ Recording validation failed:',
                ...this.validationErrors.map(e => `  ${e}`)
            ].join('\n');

            if (this.config.validationMode === 'strict') {
                throw new Error(errorMessage);
            } else {
                console.warn(errorMessage);
            }
        } else {
            console.log('✅ All recordings validated successfully');
        }
    }
}
```

### Phase 4: Update Test Framework

Modify test suite to pass source file info:

```typescript
// In generative-execution.test.ts

async function createTestClientWithSource(
    recordingsDir: string,
    sourceFilePath: string  // NEW parameter
) {
    const mode = process.env.DYGRAM_TEST_MODE || 'interactive';

    if (mode === 'playback') {
        return new PlaybackTestClient({
            recordingsDir,
            sourceFile: sourceFilePath,        // NEW
            validationMode: 'strict',           // NEW
            simulateDelay: true,
            delay: 100,
            strict: true
        });
    }

    return new InteractiveTestClient({
        mode: 'file-queue',
        queueDir: '.dygram-test-queue',
        recordResponses: true,
        recordingsDir,
        sourceFile: sourceFilePath,           // NEW
        timeout: 60000
    });
}

// Usage in tests
const client = createTestClientWithSource(
    `test/fixtures/recordings/generative-tool-execution/${testFile.name}`,
    testFile.path  // Pass source file path
);
```

## Implementation Phases

### Phase 1: Basic Hash Validation (Priority: High)

**Goal**: Detect when recordings don't match source files

**Changes**:
1. Add `sourceMetadata` to recording format
2. Update `InteractiveTestClient` to compute and store hash
3. Update `PlaybackTestClient` to validate hash
4. Update test framework to pass source file paths

**Deliverables**:
- Recordings include source file hash
- Playback fails with clear error when hash mismatches
- Clear instructions on regenerating recordings

**Estimated Effort**: 4-6 hours

### Phase 2: Enhanced Metadata (Priority: Medium)

**Goal**: Provide quick validation without parsing

**Changes**:
1. Store parsed machine structure in metadata
2. Validate node names match
3. Validate edge labels match
4. Quick structural comparison

**Deliverables**:
- Fast validation without re-parsing
- Better error messages showing what changed
- Debug tools for comparing recordings vs source

**Estimated Effort**: 2-3 hours

### Phase 3: Automatic Invalidation (Priority: Medium)

**Goal**: Automatically detect and mark stale recordings

**Changes**:
1. Add recording validation CLI command
2. Integrate into pre-commit hooks
3. Add CI check for stale recordings
4. Provide recording regeneration workflow

**Deliverables**:
- `npm run validate-recordings` command
- CI pipeline rejects stale recordings
- Developer workflow for regeneration

**Estimated Effort**: 3-4 hours

### Phase 4: Smart Recording Management (Priority: Low)

**Goal**: Intelligent recording lifecycle management

**Changes**:
1. Recording versioning (track source changes)
2. Automatic migration of recordings
3. Partial invalidation (only affected recordings)
4. Recording diff tools

**Deliverables**:
- Version tracking for recordings
- Migration tools
- Intelligent invalidation

**Estimated Effort**: 6-8 hours

## Benefits

1. **Reliability**: Tests fail clearly when recordings are stale
2. **Debuggability**: Easy to identify recording vs code issues
3. **Developer Experience**: Clear workflow for regenerating recordings
4. **CI Confidence**: No silent failures from stale recordings
5. **Maintenance**: Easier to track when recordings need updates

## Migration Strategy

### For Existing Recordings

Two approaches:

**Approach 1: Gradual Migration (Recommended)**
```bash
# Step 1: Add metadata to new recordings only
DYGRAM_TEST_MODE=interactive npm test

# Step 2: Validate only recordings with metadata
# (Skip validation for old recordings without metadata)

# Step 3: Eventually regenerate all recordings
npm run regenerate-recordings
```

**Approach 2: Immediate Migration**
```bash
# Step 1: Add metadata to all existing recordings
npm run add-metadata-to-recordings

# Step 2: Enable strict validation
# (All recordings now have metadata)
```

### Backward Compatibility

```typescript
// In PlaybackTestClient
if (!recording.sourceMetadata) {
    if (this.config.requireMetadata) {
        throw new Error('Recording missing metadata');
    } else {
        console.warn('Recording without metadata (legacy format)');
        // Continue with playback
    }
}
```

## Alternative Approaches Considered

### 1. Per-Request Validation

**Idea**: Validate each request's tools match recording

**Pros**:
- Catches mismatches at request level
- More granular error messages

**Cons**:
- More complex implementation
- Doesn't catch broader structural changes
- Can't detect stale recordings before test runs

**Decision**: Complement file-level validation, not replace

### 2. Snapshot-Based Validation

**Idea**: Use Jest-style snapshots for machine structure

**Pros**:
- Familiar pattern
- Built-in diff tools

**Cons**:
- Different failure mode than hash validation
- Requires snapshot management infrastructure
- Doesn't integrate with recording system

**Decision**: Could be added as Phase 5

### 3. Content-Based Addressing

**Idea**: Store recordings by content hash instead of request ID

**Pros**:
- Automatic deduplication
- Natural invalidation

**Cons**:
- Breaks recording order assumption
- Hard to map back to source
- Major refactor required

**Decision**: Too disruptive for current system

## Example Error Messages

### Stale Recording Detected

```
❌ Recording validation failed:

  Recording req-1234-1 has stale source file:
    Expected hash: a3f8b9c2...
    Recorded hash: d7e1f4a8...
    Source file: examples/testing/tool-execution/simple-router.dy

    The source file has changed since this recording was created.

    To fix:
      1. Review changes to examples/testing/tool-execution/simple-router.dy
      2. Regenerate recordings:
         DYGRAM_TEST_MODE=interactive npm test test/validating/generative-execution.test.ts
      3. Commit updated recordings

  Detected 5 stale recordings in generative-tool-execution/simple-router/
```

### Missing Metadata

```
⚠️  Warning: Recordings missing source metadata (legacy format)

  The following recordings do not have source file metadata:
    - req-1234-1.json
    - req-1234-2.json

  These recordings may be stale. To add metadata:
    npm run add-metadata-to-recordings --dir test/fixtures/recordings/...

  Or regenerate recordings:
    DYGRAM_TEST_MODE=interactive npm test
```

## Testing Strategy

1. **Unit Tests**:
   - Test hash computation
   - Test metadata extraction
   - Test validation logic

2. **Integration Tests**:
   - Create recording with metadata
   - Validate matching source
   - Validate mismatched source
   - Handle missing metadata gracefully

3. **End-to-End Tests**:
   - Modify source file
   - Verify playback fails
   - Regenerate recordings
   - Verify playback succeeds

## Open Questions

1. **Should we validate on every playback request or once at startup?**
   - Recommendation: Once at startup (faster)
   - Could add per-request validation as debug mode

2. **What validation level should be default?**
   - Recommendation: 'warn' for gradual rollout
   - Switch to 'strict' after migration

3. **Should we store multiple recordings per source version?**
   - Recommendation: No for now (complexity)
   - Could be Phase 4 feature

4. **How to handle renamed files?**
   - Recommendation: Treat as new file (regenerate recordings)
   - Could add migration tool to handle renames

## Related Work

- Jest snapshot testing
- HTTP recording libraries (VCR, Polly.js)
- Git content-addressable storage
- Build system cache invalidation

## References

- Recording format: `src/language/interactive-test-client.ts`
- Playback client: `src/language/playback-test-client.ts`
- Test framework: `test/validating/generative-execution.test.ts`
- Current issue: Recordings used even when source files change
