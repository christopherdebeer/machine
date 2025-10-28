# Phase 2 Self-Hosting Analysis - Complete Index

Generated: October 28, 2024

## Overview

This is a comprehensive analysis of the existing Dygram parser, generator, and runtime implementations to enable Phase 2 self-hosting. The analysis includes file locations, function signatures, integration points, and implementation guidance.

## Document Guide

### 1. PHASE2_README.md - START HERE
**Quick start guide for Phase 2 implementation**
- 5-step integration overview
- Component summary table  
- Critical data flow diagram
- Key integration points
- Conversion functions needed
- Testing checklist
- Success criteria

**Read this first if you're**: Starting Phase 2 work, need a quick overview, planning sprints

### 2. PHASE2_FUNCTION_REFERENCE.md - QUICK LOOKUP
**Function signatures and API reference**
- Parser API
- All generator functions (JSON, Graphviz, HTML, Markdown, DSL)
- Validator classes and methods
- RailsExecutor API
- Agent context builder
- Type definitions and interfaces
- Validation types
- Integration patterns

**Use this when you're**: Implementing bootstrap tools, need exact function signatures, looking up type definitions

### 3. PHASE2_ANALYSIS.md - COMPREHENSIVE DEEP-DIVE
**Complete technical analysis of all components**
- Parser implementation details (1 section)
- Generator implementations (5 sections)
  - JSON Generator
  - Graphviz Generator
  - HTML Generator
  - Markdown Generator
  - DSL Reverse Generator
- Validator implementation (2 sections)
- Runtime/Executor implementation (3 sections)
- Bootstrap integration architecture
- Data flow and type conversions
- Implementation notes
- File locations summary
- Next steps checklist

**Read this when you're**: Deep-diving into components, need architectural context, troubleshooting implementation

## Key File Locations

### Parser
- `src/language/main.ts` - Language server entry point
- `src/language/machine-module.ts` - Parser services creation

### Generators
- `src/language/generator/generator.ts` - All generators (JSON, Graphviz, HTML, Markdown, DSL)
- `src/language/diagram/graphviz-generator.ts` - Graphviz diagram API
- `src/language/diagram/graphviz-dot-diagram.ts` - DOT generation
- `src/language/diagram/index.ts` - Public diagram API
- `src/language/diagram/types.ts` - MachineJSON, DiagramOptions types

### Validators
- `src/language/graph-validator.ts` - Graph validation (cycles, reachability, etc.)
- `src/language/type-checker.ts` - Type validation
- `src/language/validation-errors.ts` - Validation error types

### Runtime/Execution
- `src/language/rails-executor.ts` - Primary executor (rails pattern)
- `src/language/base-executor.ts` - Base types and shared functionality
- `src/language/agent-context-builder.ts` - System prompt building for agents

### Bootstrap
- `src/language/bootstrap-tools.ts` - Bootstrap tool registry
- `src/language/bootstrap-executor.ts` - Minimal bootstrap core

## Document Cross-References

### To understand the parser:
1. Read: PHASE2_README.md Section "Step 1: Parse Dygram"
2. Lookup: PHASE2_FUNCTION_REFERENCE.md Section "1. PARSER"
3. Dive deep: PHASE2_ANALYSIS.md Section "1. Parser Implementation"

### To implement generators:
1. Read: PHASE2_README.md Section "Step 3-4: Generate JSON & Diagrams"
2. Lookup: PHASE2_FUNCTION_REFERENCE.md Section "2. GENERATORS"
3. Dive deep: PHASE2_ANALYSIS.md Section "2. Generator Implementations"

### To integrate the executor:
1. Read: PHASE2_README.md Section "Step 5: Execute Machine"
2. Lookup: PHASE2_FUNCTION_REFERENCE.md Section "4. RUNTIME/EXECUTOR"
3. Dive deep: PHASE2_ANALYSIS.md Section "4. Runtime/Executor Implementation"

### To understand data flow:
1. Read: PHASE2_README.md Section "Critical Data Flow"
2. Reference: PHASE2_FUNCTION_REFERENCE.md Section "Integration Patterns"
3. Deep: PHASE2_ANALYSIS.md Section "6. Data Flow & Type Conversions"

### To implement bootstrap tools:
1. Read: PHASE2_README.md Section "Quick Start: 5-Step Integration"
2. Lookup: PHASE2_FUNCTION_REFERENCE.md Section "Integration Patterns"
3. Deep: PHASE2_ANALYSIS.md Section "5. Bootstrap Integration Architecture"

## Core Components

### Parser (1 component)
- **Input**: DSL source code string
- **Output**: Langium AST (Machine type)
- **Priority**: P0 (Required)
- **Status**: Exists, needs bootstrap integration

### Generators (5+ components)
1. **JSON Generator** - AST to MachineJSON
   - **Priority**: P0 (Core)
   - **Status**: Fully implemented

2. **Graphviz Generator** - AST to DOT diagrams
   - **Priority**: P0 (Core)
   - **Status**: Fully implemented

3. **HTML Generator** - AST to interactive HTML
   - **Priority**: P1 (Nice to have)
   - **Status**: Implemented

4. **Markdown Generator** - AST to documentation
   - **Priority**: P1 (Nice to have)
   - **Status**: Implemented

5. **DSL Reverse Generator** - MachineJSON back to DSL
   - **Priority**: P1 (Important for round-trip)
   - **Status**: Fully implemented

### Validators (2 components)
1. **Graph Validator**
   - Checks: Cycles, reachability, entry/exit points, orphaned nodes
   - **Priority**: P0 (Core)
   - **Status**: Fully implemented

2. **Type Checker**
   - Checks: Attribute type matching
   - **Priority**: P2 (Advanced)
   - **Status**: Implemented

### Runtime (1 primary + supporting)
1. **RailsExecutor**
   - Execution model: Rails pattern (auto vs. agent-controlled)
   - **Priority**: P0 (Core)
   - **Status**: Fully implemented

2. **AgentContextBuilder**
   - Builds system prompts and context
   - **Priority**: P0 (Core)
   - **Status**: Fully implemented

## Phase 2 Milestone Breakdown

### Phase 2.1: Bootstrap Tool Wiring (CRITICAL PATH)
- [ ] Implement parse_dygram tool
- [ ] Implement validate_machine tool
- [ ] Implement generate_json tool
- [ ] Implement generate_graphviz tool
- [ ] Implement execute_machine tool
- **Output**: 5 core bootstrap tools working

### Phase 2.2: Extended Tools (NICE TO HAVE)
- [ ] Implement generate_html tool
- [ ] Implement generate_markdown tool
- [ ] Implement generate_dsl tool
- **Output**: Full generation pipeline

### Phase 2.3: Meta-Tools (FUTURE)
- [ ] construct_tool (dynamic tool creation)
- [ ] get_machine_definition (machine introspection)
- [ ] update_definition (machine modification)
- **Output**: Self-modifying machines

### Phase 2.4: Optimization (FUTURE)
- [ ] Type checking as tool
- [ ] Dependency analysis
- [ ] Performance optimization

## Type System

### Three Main Type Formats

1. **Machine (Langium AST)**
   - Full type information
   - Hierarchical structure
   - Complex but powerful
   - Location: `src/generated/ast.ts`

2. **MachineJSON (Serialized)**
   - Simplified, flattened
   - Easy to serialize/deserialize
   - Used by diagram generators
   - Location: `src/language/diagram/types.ts`

3. **MachineData (Runtime)**
   - Flat structure for execution
   - Simple node/edge lists
   - Used by RailsExecutor
   - Location: `src/language/base-executor.ts`

**Conversion Flow**:
```
Machine (AST) 
    ↓ generateJSON()
MachineJSON
    ↓ custom converter needed
MachineData
    ↓ RailsExecutor.create()
Execution Result
```

## Critical Implementation Gaps

### Required Before Phase 2.1 Complete
1. [ ] AST → MachineData conversion function
2. [ ] Parser API verification (exact Langium API)
3. [ ] Error handling standardization

### Required Before Phase 2.2 Complete
1. [ ] Round-trip testing (DSL → JSON → DSL)
2. [ ] HTML executor script availability
3. [ ] Markdown generation options

### Required Before Phase 2.3
1. [ ] Meta-tool manager integration
2. [ ] Dynamic tool construction
3. [ ] Machine definition APIs

## Testing Scenarios

### Basic Tests (Phase 2.1)
```
machine "Simple"
init Start
state End
Start -> End
```

### Intermediate Tests (Phase 2.1)
```
machine "Branching"
init Start
state ProcessA
state ProcessB
state End

Start -> ProcessA
Start -> ProcessB
ProcessA -> End
ProcessB -> End
```

### Advanced Tests (Phase 2.2+)
- Nested state modules
- Context nodes with attributes
- Agent decision nodes
- Dynamic tool construction

## Performance Considerations

- Parser: Should handle machines with 1000+ nodes
- Validators: Should complete in <100ms
- Generators: Should complete in <50ms
- Execution: Depends on LLM response time

## Security Considerations

- Sandboxed execution with step/invocation limits
- Cycle detection (max 20 recent transitions)
- Timeout protection (default 5 minutes)
- No arbitrary code execution (defined tools only)

## Next Steps

1. **Immediate** (this week):
   - Review all three documents
   - Identify parser API specifics
   - Create AST → MachineData converter

2. **Week 1** (Phase 2.1):
   - Implement 5 core bootstrap tools
   - Test each tool independently
   - Test tool integration

3. **Week 2** (Phase 2.2):
   - Implement extended tools
   - Test round-trip compilation
   - Performance optimization

4. **Week 3+** (Phase 2.3+):
   - Meta-tools and advanced features
   - Optimization and hardening
   - Documentation and examples

## Questions to Answer

1. What is the exact Langium parser API?
   - Answer: See PHASE2_README.md "Step 1"

2. How are nodes serialized from AST?
   - Answer: See PHASE2_ANALYSIS.md "2.1 JSON Generator"

3. What is the rails pattern execution model?
   - Answer: See PHASE2_ANALYSIS.md "4.1 RailsExecutor"

4. How do I convert Machine AST to MachineData?
   - Answer: See PHASE2_FUNCTION_REFERENCE.md "Critical Conversion Functions"

5. What types are used where?
   - Answer: See PHASE2_ANALYSIS.md "6. Data Flow & Type Conversions"

## Contact & Resources

- **Langium Documentation**: https://langium.org/
- **Graphviz DOT Specification**: https://graphviz.org/doc/info/lang.html
- **Claude Agent SDK**: Anthropic documentation
- **Repository**: `/home/runner/work/machine/machine`

---

**All documents are in the repository root:**
- PHASE2_README.md - Start here
- PHASE2_FUNCTION_REFERENCE.md - Quick lookup
- PHASE2_ANALYSIS.md - Deep dive
- PHASE2_INDEX.md - This file

Total: 2031 lines of analysis and implementation guidance

