# Annotation Handling Fix Proposal

**Date**: 2025-12-04
**Status**: 📋 Proposal
**Related**: annotation-handling-inconsistencies-2025-12-04.md

## Executive Summary

This proposal outlines a plan to standardize annotation handling across all DyGram annotations by:
1. Creating a unified annotation processing framework
2. Migrating existing annotations to consistent patterns
3. Enhancing @async and @StrictMode with full attribute support
4. Fixing @meta to process as annotation (not convert to attribute)

## Goals

1. **Consistency**: All annotations support simple, value, and attribute forms
2. **Maintainability**: Single source of truth for annotation processing
3. **Extensibility**: Easy to add new annotations with full feature support
4. **Validation**: Clear error messages for invalid annotation usage
5. **Backwards Compatibility**: Existing code continues to work

## Proposed Architecture

### Core Component: Unified Annotation Processor

```typescript
/**
 * Unified annotation processing framework
 * Handles simple, value, and attribute forms consistently
 */

export interface AnnotationMatch {
    name: string;           // The actual annotation name used
    value?: string;         // Value from @name("value") form
    attributes?: Record<string, unknown>;  // Attributes from @name(k: v) form
}

export interface AnnotationConfig<T> {
    /** Primary name and aliases for this annotation */
    names: string[];

    /** Default configuration when annotation is present with no params */
    defaultValue: T;

    /** Parse annotation into typed config */
    parse: (match: AnnotationMatch) => T;

    /** Optional validation */
    validate?: (config: T, match: AnnotationMatch) => string[];

    /** Optional alias-specific defaults */
    aliasDefaults?: Map<string, Partial<T>>;
}

export class UnifiedAnnotationProcessor {
    /**
     * Process annotations to find and parse a specific annotation type
     */
    static process<T>(
        annotations: MachineAnnotationJSON[] | undefined,
        config: AnnotationConfig<T>
    ): T | null {
        if (!annotations || annotations.length === 0) {
            return null;
        }

        // Find first matching annotation by name or alias
        const annotation = annotations.find(a =>
            config.names.includes(a.name.toLowerCase())
        );

        if (!annotation) {
            return null;
        }

        // Build match object
        const match: AnnotationMatch = {
            name: annotation.name,
            value: annotation.value,
            attributes: annotation.attributes
        };

        // Apply alias-specific defaults if configured
        let baseDefault = config.defaultValue;
        if (config.aliasDefaults?.has(annotation.name.toLowerCase())) {
            const aliasOverrides = config.aliasDefaults.get(annotation.name.toLowerCase())!;
            baseDefault = { ...baseDefault, ...aliasOverrides };
        }

        // Parse the annotation
        let result: T;
        try {
            result = config.parse(match);
        } catch (error) {
            console.warn(`Failed to parse @${annotation.name}:`, error);
            return baseDefault;
        }

        // Validate if validator provided
        if (config.validate) {
            const errors = config.validate(result, match);
            if (errors.length > 0) {
                console.warn(`Validation errors for @${annotation.name}:`, errors);
                // Return result anyway but log warnings
            }
        }

        return result;
    }

    /**
     * Helper: Parse boolean attribute value
     */
    static parseBoolean(
        value: unknown,
        defaultValue: boolean
    ): boolean {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true') return true;
            if (lower === 'false') return false;
        }
        return defaultValue;
    }

    /**
     * Helper: Parse string attribute value (strips quotes)
     */
    static parseString(
        value: unknown,
        defaultValue: string
    ): string {
        if (value === undefined || value === null) {
            return defaultValue;
        }
        if (typeof value === 'string') {
            return value.replace(/^["']|["']$/g, '');
        }
        return String(value);
    }

    /**
     * Helper: Parse number attribute value
     */
    static parseNumber(
        value: unknown,
        defaultValue: number,
        min?: number,
        max?: number
    ): number {
        if (value === undefined || value === null) {
            return defaultValue;
        }

        let num: number;
        if (typeof value === 'number') {
            num = value;
        } else if (typeof value === 'string') {
            num = parseInt(value, 10);
            if (isNaN(num)) {
                return defaultValue;
            }
        } else {
            return defaultValue;
        }

        // Apply bounds
        if (min !== undefined) num = Math.max(num, min);
        if (max !== undefined) num = Math.min(num, max);

        return num;
    }
}
```

## Migration Plan for Each Annotation

### 1. @barrier - Already Gold Standard (Keep Enhanced)

**Current**: Fully featured in `state-builder.ts`

**Action**: Document as reference implementation, add to unified framework for consistency

```typescript
export interface BarrierConfig {
    id: string;
    merge: boolean;
}

export const BarrierAnnotationConfig: AnnotationConfig<BarrierConfig> = {
    names: ['barrier', 'wait', 'sync', 'join', 'merge'],
    defaultValue: { id: 'default', merge: false },

    aliasDefaults: new Map([
        ['join', { merge: true }],
        ['merge', { merge: true }]
    ]),

    parse: (match) => {
        // Attribute form takes precedence
        if (match.attributes) {
            return {
                id: UnifiedAnnotationProcessor.parseString(
                    match.attributes.id,
                    'default'
                ),
                merge: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.merge,
                    // Use alias default if no explicit merge value
                    match.name === 'join' || match.name === 'merge'
                )
            };
        }

        // Value form
        if (match.value) {
            return {
                id: match.value.replace(/['"]/g, ''),
                merge: match.name === 'join' || match.name === 'merge'
            };
        }

        // Simple form - use alias defaults
        return {
            id: 'default',
            merge: match.name === 'join' || match.name === 'merge'
        };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (!config.id || config.id.trim() === '') {
            errors.push('Barrier id cannot be empty');
        }
        return errors;
    }
};

// Usage
const barrierConfig = UnifiedAnnotationProcessor.process(
    edge.annotations,
    BarrierAnnotationConfig
);
```

### 2. @async - Enhance with Full Support

**Current**: Only simple form supported

**Proposed Enhancement**:

```typescript
export interface AsyncConfig {
    enabled: boolean;
    maxPaths?: number;      // Limit concurrent spawned paths
    priority?: number;      // Priority for spawned path (higher = higher priority)
    copyContext?: boolean;  // Whether to copy context state to spawned path
    name?: string;          // Optional name for the spawned path
}

export const AsyncAnnotationConfig: AnnotationConfig<AsyncConfig> = {
    names: ['async', 'spawn', 'parallel', 'fork'],
    defaultValue: {
        enabled: true,
        copyContext: true  // Sensible default
    },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                ),
                maxPaths: match.attributes.maxPaths !== undefined
                    ? UnifiedAnnotationProcessor.parseNumber(
                        match.attributes.maxPaths,
                        Infinity,
                        1,
                        1000
                    )
                    : undefined,
                priority: match.attributes.priority !== undefined
                    ? UnifiedAnnotationProcessor.parseNumber(
                        match.attributes.priority,
                        0,
                        -100,
                        100
                    )
                    : undefined,
                copyContext: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.copyContext,
                    true
                ),
                name: match.attributes.name !== undefined
                    ? UnifiedAnnotationProcessor.parseString(
                        match.attributes.name,
                        ''
                    )
                    : undefined
            };
        }

        // Value form: treat as enabled flag
        if (match.value) {
            const enabled = match.value.toLowerCase() !== 'false';
            return {
                enabled,
                copyContext: true
            };
        }

        // Simple form
        return {
            enabled: true,
            copyContext: true
        };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (config.maxPaths !== undefined && config.maxPaths < 1) {
            errors.push('maxPaths must be at least 1');
        }
        if (config.name !== undefined && config.name.trim() === '') {
            errors.push('name cannot be empty string');
        }
        return errors;
    }
};

// Usage examples:
// @async                                    → { enabled: true, copyContext: true }
// @async("false")                          → { enabled: false }
// @async(maxPaths: 5)                      → { enabled: true, maxPaths: 5, copyContext: true }
// @async(priority: 10; copyContext: false) → { enabled: true, priority: 10, copyContext: false }
// @spawn(name: "background_task")          → { enabled: true, name: "background_task", copyContext: true }
```

### 3. @StrictMode - Enhance with Configuration

**Current**: Boolean flag only in linker

**Proposed Enhancement**:

```typescript
export interface StrictModeConfig {
    enabled: boolean;
    level: 'error' | 'warn';
    nodes: boolean;         // Strict checking for node references
    edges: boolean;         // Strict checking for edge references
    types: boolean;         // Strict type checking
    autoCreate: boolean;    // Allow auto-creation (inverse of strict)
}

export const StrictModeAnnotationConfig: AnnotationConfig<StrictModeConfig> = {
    names: ['strictmode', 'strict'],
    defaultValue: {
        enabled: true,
        level: 'error',
        nodes: true,
        edges: true,
        types: false,  // Type checking less common
        autoCreate: false
    },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                ),
                level: match.attributes.level === 'warn' ? 'warn' : 'error',
                nodes: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.nodes,
                    true
                ),
                edges: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.edges,
                    true
                ),
                types: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.types,
                    false
                ),
                autoCreate: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.autoCreate,
                    false
                )
            };
        }

        // Value form: treat as level
        if (match.value) {
            const value = match.value.toLowerCase();
            return {
                enabled: true,
                level: value === 'warn' ? 'warn' : 'error',
                nodes: true,
                edges: true,
                types: false,
                autoCreate: false
            };
        }

        // Simple form
        return {
            enabled: true,
            level: 'error',
            nodes: true,
            edges: true,
            types: false,
            autoCreate: false
        };
    },

    validate: (config) => {
        const errors: string[] = [];
        if (config.enabled && config.autoCreate) {
            errors.push('Cannot have both strict mode enabled and autoCreate enabled');
        }
        return errors;
    }
};

// Usage examples:
// @StrictMode                        → All strict checking enabled (error level)
// @StrictMode("warn")               → All strict checking with warnings
// @StrictMode(nodes: true; edges: false) → Only strict node checking
// @StrictMode(level: "warn"; types: true) → Warnings + type checking
// @strict(autoCreate: true)         → Alias with auto-creation allowed
```

### 4. @meta - Fix to Process as Annotation

**Current**: Converts to attribute in serializer

**Problem**: Loses annotation semantics, can't be parameterized

**Proposed Fix**:

```typescript
export interface MetaConfig {
    enabled: boolean;
    scope: 'local' | 'global' | 'inherited';
    readonly: boolean;      // Prevent runtime modification
    persist: boolean;       // Persist across checkpoints
}

export const MetaAnnotationConfig: AnnotationConfig<MetaConfig> = {
    names: ['meta'],
    defaultValue: {
        enabled: true,
        scope: 'local',
        readonly: false,
        persist: true
    },

    parse: (match) => {
        // Attribute form
        if (match.attributes) {
            return {
                enabled: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.enabled,
                    true
                ),
                scope: ['local', 'global', 'inherited'].includes(
                    match.attributes.scope as string
                )
                    ? (match.attributes.scope as 'local' | 'global' | 'inherited')
                    : 'local',
                readonly: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.readonly,
                    false
                ),
                persist: UnifiedAnnotationProcessor.parseBoolean(
                    match.attributes.persist,
                    true
                )
            };
        }

        // Value form: treat as scope
        if (match.value) {
            const scope = match.value.toLowerCase();
            return {
                enabled: true,
                scope: ['local', 'global', 'inherited'].includes(scope)
                    ? (scope as 'local' | 'global' | 'inherited')
                    : 'local',
                readonly: false,
                persist: true
            };
        }

        // Simple form
        return {
            enabled: true,
            scope: 'local',
            readonly: false,
            persist: true
        };
    }
};

// Usage examples:
// @meta                             → { enabled: true, scope: 'local' }
// @meta("global")                   → { enabled: true, scope: 'global' }
// @meta(scope: "inherited"; readonly: true) → Inherited, read-only meta node
// @meta(persist: false)             → Non-persistent meta state
```

**Breaking Change**: Need to update code that expects `meta: true` attribute

## Implementation Phases

### Phase 1: Foundation (Week 1)
- ✅ Investigation complete
- ✅ Proposal written
- ⏭️ Create `unified-annotation-processor.ts`
- ⏭️ Implement `UnifiedAnnotationProcessor` class
- ⏭️ Add unit tests for unified processor
- ⏭️ Document API and usage patterns

### Phase 2: @barrier Migration (Week 1-2)
- Migrate existing `getBarrierAnnotation` to use unified processor
- Verify all tests pass
- Update documentation
- **No breaking changes** (behavior identical)

### Phase 3: @async Enhancement (Week 2)
- Create `AsyncAnnotationConfig` with full attribute support
- Update `getAsyncAnnotation` to use unified processor
- Update `spawnPath` function to use new config options
- Add tests for new attributes
- Update documentation
- **Backwards compatible** (simple form unchanged)

### Phase 4: @StrictMode Enhancement (Week 2-3)
- Create `StrictModeAnnotationConfig`
- Update `machine-linker.ts` to use unified processor
- Implement granular strict checking (nodes vs edges vs types)
- Add validation warnings vs errors
- Add tests
- Update documentation
- **Backwards compatible** (simple form unchanged)

### Phase 5: @meta Fix (Week 3)
- Create `MetaAnnotationConfig`
- Remove attribute conversion from `serializer.ts`
- Add meta annotation processing to runtime
- Update existing code expecting `meta: true` attribute
- Add tests
- Update documentation
- **BREAKING CHANGE** - requires migration guide

### Phase 6: Cleanup (Week 4)
- Remove duplicate processing code
- Consolidate annotation handling in one module
- Add validation warnings for unknown annotations
- Update all documentation
- Create migration guide
- Final integration tests

## Testing Strategy

### Unit Tests (Per Annotation)
```typescript
describe('@barrier annotation', () => {
    it('should parse simple form', () => { });
    it('should parse value form', () => { });
    it('should parse attribute form', () => { });
    it('should apply alias defaults', () => { });
    it('should validate config', () => { });
    it('should handle invalid values gracefully', () => { });
});
```

### Integration Tests
```typescript
describe('Unified annotation processing', () => {
    it('should process all annotations consistently', () => { });
    it('should handle multiple annotations on same element', () => { });
    it('should validate annotation combinations', () => { });
});
```

### Regression Tests
```typescript
describe('Backwards compatibility', () => {
    it('should maintain existing @barrier behavior', () => { });
    it('should maintain existing @async behavior', () => { });
    it('should maintain existing @StrictMode behavior', () => { });
});
```

## Migration Guide for Users

### @async Enhancements (Non-Breaking)

**Before**:
```dygram
Start -> @async -> Process
```

**After** (same behavior):
```dygram
Start -> @async -> Process
```

**New Capabilities**:
```dygram
// Limit spawned paths
Start -> @async(maxPaths: 5) -> Process

// Set priority
Critical -> @spawn(priority: 10) -> ProcessCritical

// Don't copy context
Start -> @fork(copyContext: false) -> Independent
```

### @StrictMode Enhancements (Non-Breaking)

**Before**:
```dygram
machine "App" @StrictMode
```

**After** (same behavior):
```dygram
machine "App" @StrictMode
```

**New Capabilities**:
```dygram
// Warning mode instead of errors
machine "App" @StrictMode("warn")

// Granular control
machine "App" @StrictMode(nodes: true; edges: false; types: true)

// Mixed mode
machine "App" @StrictMode(level: "warn"; autoCreate: true)
```

### @meta Changes (BREAKING)

**Before**:
```dygram
machine "App" @meta

node MetaNode @meta
```

**After**:
```dygram
// Same syntax, different internal processing
machine "App" @meta

// Now supports configuration
node MetaNode @meta(scope: "global"; readonly: true)
```

**Code Changes Required**:
```typescript
// Before: Checking for meta attribute
if (node.attributes?.some(a => a.name === 'meta' && a.value === true)) {
    // Is meta node
}

// After: Checking for meta annotation
const metaConfig = UnifiedAnnotationProcessor.process(
    node.annotations,
    MetaAnnotationConfig
);
if (metaConfig?.enabled) {
    // Is meta node
}
```

## Benefits

1. **Consistency**: All annotations follow same pattern
2. **Power**: Full attribute support for all annotations
3. **Maintainability**: Single source of truth for annotation processing
4. **Extensibility**: Easy to add new annotations
5. **Validation**: Clear error messages for invalid usage
6. **Documentation**: Self-documenting through typed configs

## Risks & Mitigation

### Risk 1: @meta Breaking Change
**Impact**: Existing code checking for `meta: true` attribute breaks

**Mitigation**:
- Provide clear migration guide
- Add deprecation warnings in previous release
- Offer automated migration script
- Keep backwards compatibility layer for one major version

### Risk 2: Performance
**Impact**: Unified processor might be slower than specialized code

**Mitigation**:
- Benchmark before/after
- Cache parsed annotations if needed
- Only parse annotations once during serialization

### Risk 3: Scope Creep
**Impact**: Too many features added to annotations

**Mitigation**:
- Start with conservative attribute sets
- Add attributes based on user demand
- Document when NOT to add attributes

## Success Criteria

1. ✅ All annotations support simple, value, and attribute forms
2. ✅ Zero test regressions
3. ✅ Documentation updated
4. ✅ Migration guide published
5. ✅ Performance impact < 5%
6. ✅ Code coverage maintained or improved

## Next Steps

1. **Review & Approval**: Team review of proposal
2. **Prioritization**: Agree on implementation timeline
3. **Create Tickets**: Break down into implementable tasks
4. **Assign Work**: Distribute implementation work
5. **Begin Implementation**: Start with Phase 1

---

**Questions for Review**:
1. Is the unified processor approach appropriate?
2. Are the proposed attribute sets for @async and @StrictMode useful?
3. Is the @meta breaking change acceptable?
4. What's the priority order for implementation?
5. Any additional annotations that need attention?
