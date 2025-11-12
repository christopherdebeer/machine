# Homepage Content Review: Proposed Changes

## Executive Summary

The current homepage effectively introduces DyGram but can better capture its simplicity and vision through more carefully graduated examples. This proposal refines the homepage to show incremental evolution from thought to complete system, with each stage naturally building on the previous one.

## Key Changes

### 1. Enhanced Vision Statement

**Current:**
> "A lean, executable DSL for rapid prototyping that evolves from unstructured sketches to complete systems through iterative execution and generative prompting."

**Proposed:**
> "A lean, executable DSL that transforms unstructured ideas into complete systems through iterative refinement and intelligent execution."

**Rationale:** More direct, emphasizes the transformation journey.

### 2. Clearer Value Propositions

**Current:** Three pillars (Lean Core DSL, Iterative Evolution, Structured Emergence) are conceptual.

**Proposed:** Three practical benefits:
- **Start Simple, Stay Executable** - emphasizes immediate executability
- **Evolve Through Execution** - highlights feedback-driven refinement
- **Intelligent by Design** - introduces the rails metaphor

**Rationale:** More concrete, easier to grasp, ties to actual usage.

### 3. Better Example Progression

#### Current Stages:
1. `problem -> solution` → solution sketch with Input/Task/Result
2. Authentication system with Concepts and Resources
3. Full DyGram system (275 lines)

**Issues:**
- Stage 1 to 2 jumps to specific domain (authentication) disconnected from stage 1
- Stage 2 doesn't show intermediate capabilities (LLM prompts, templates)
- Stage 3 is comprehensive but overwhelming
- No clear narrative thread

#### Proposed Stages:
1. **Capture the Thought** (3-8 lines)
   - `idea -> prototype;`
   - Named machine with simple workflow
   - Shows: Bare minimum expressiveness

2. **Add Structure** (20 lines)
   - Node types (Input, Task, Output)
   - Simple attributes
   - Shows: Types and attributes emerge naturally

3. **Make it Intelligent** (35 lines)
   - LLM prompts with template strings
   - Annotations (@Critical)
   - Shows: AI-powered reasoning on demand

4. **Organize Complexity** (80 lines)
   - Nested processes (Discovery, Execution, Review)
   - Qualified names
   - Context nodes for shared config
   - Feedback loops
   - Shows: Hierarchy and organization

5. **Full Expressiveness** (180 lines)
   - Rich type system
   - All seven arrow types with semantic meaning
   - Deep nesting
   - Composition, aggregation, inheritance
   - Multiplicity
   - Shows: Complete system modeling

**Benefits:**
- Each stage builds on previous with clear "What changed" sections
- Single narrative thread (stays domain-agnostic until later stages)
- Demonstrates specific capabilities incrementally
- Examples are progressively more complex but always understandable
- Shows WHY you'd add each feature, not just HOW

### 4. Progressive Complexity Graph

```
Lines of Code by Stage:
Stage 1:  3-8    lines (↑5 lines)    - Essence
Stage 2:  20     lines (↑12 lines)   - Structure
Stage 3:  35     lines (↑15 lines)   - Intelligence
Stage 4:  80     lines (↑45 lines)   - Organization
Stage 5:  180    lines (↑100 lines)  - Full power
```

This creates a much gentler learning curve than:
- Current: 2 lines → 20 lines → 275 lines

### 5. Improved "What Changed" Annotations

Each stage includes a **"What changed:"** section that explicitly calls out:
- New features introduced
- Why they're useful
- How they build on previous stage

Examples:
- Stage 2: "Nodes have types and attributes. The workflow tells a story."
- Stage 3: "Tasks can have prompt attributes—LLM reasoning on demand."
- Stage 4: "Nested processes organize related nodes. Context nodes share configuration."

### 6. New "DyGram Philosophy" Section

Replaces abstract "What is DyGram?" concepts with concrete principles:
- **Thought Comes First** - Zero barrier between idea and implementation
- **Execution Drives Evolution** - Learn by running
- **Structure Emerges** - Don't impose prematurely
- **Intelligence Where It Matters** - Hybrid execution model
- **Semantics Over Syntax** - Meaning over ceremony

### 7. Enhanced Code Examples

All examples:
- Use realistic but domain-agnostic scenarios (product development, not specific auth systems)
- Are properly formatted with consistent style
- Include strategic comments showing organization
- Follow proper extraction syntax for build system
- Are self-contained and independently understandable

## Comparison: Current vs. Proposed

### Example Progression Quality

| Aspect | Current | Proposed |
|--------|---------|----------|
| **Stages** | 3 | 5 |
| **Size jump** | 2 → 20 → 275 lines | 3 → 20 → 35 → 80 → 180 lines |
| **Narrative** | Disconnected domains | Single thread |
| **Learning curve** | Steep | Graduated |
| **Feature intro** | Implicit | Explicit "What changed" |
| **LLM features** | Stage 1 & 3 | Stage 3 (after basics) |
| **Complexity org** | Only in Stage 3 | Stage 4 dedicated |

### Content Structure

| Section | Current | Proposed | Improvement |
|---------|---------|----------|-------------|
| **Tagline** | Same | Same | - |
| **Intro** | Abstract | Concrete | ✅ More accessible |
| **Value props** | Conceptual | Practical | ✅ Clearer benefits |
| **Examples** | 3 stages, steep | 5 stages, graduated | ✅ Better learning |
| **Philosophy** | Missing | New section | ✅ Vision clarity |
| **Docs links** | Present | Same | - |

## Implementation Notes

### Example Files to Create

The proposed examples reference these files for extraction:

```
examples/homepage/01-essence.dygram
examples/homepage/02-named.dygram
examples/homepage/03-structured.dygram
examples/homepage/04-intelligent.dygram
examples/homepage/05-organized.dygram
examples/homepage/06-complete.dygram
```

These will be **extracted from the markdown** by the prebuild script per DyGram's documentation workflow.

### Build Process

After implementing changes:

```bash
# Extract examples from docs
npm run prebuild

# Build and test
npm run build:web
npm test

# Update snapshots if needed
UPDATE_SNAPSHOTS=true npm test
```

### MDX Compatibility

All examples checked for:
- ✅ No headings starting with numbers
- ✅ No unescaped `<` in prose
- ✅ Proper code fence syntax for extraction
- ✅ Valid DyGram syntax

## Benefits Summary

### For New Users
- Gentler introduction with clear progression
- Understand WHY features exist, not just HOW to use them
- Can stop at any stage and have working knowledge
- Examples build confidence incrementally

### For Experienced Users
- Quick scan shows progression path
- Stage 5 demonstrates full capability
- Philosophy section articulates the vision
- Better reference for teaching others

### For the Project
- Clearer positioning: "Thought → System"
- Better demonstration of unique value (hybrid execution)
- Examples serve as teaching tools
- More compelling first impression

## Recommendations

1. **Adopt the proposed structure** - Better pedagogical flow
2. **Keep current Stage 3 example** - Move to "Examples" section as reference
3. **Add "Next Steps"** - After each stage, point to relevant docs
4. **Create video walkthrough** - Show examples evolving in real-time
5. **Link to playground** - Let users try each stage interactively

## Questions for Review

1. Is the progression too granular (5 stages vs. 3)?
2. Should Stage 4 be shorter to maintain momentum?
3. Does the product development theme resonate better than abstract examples?
4. Should we add a comparison with other DSLs/state machine tools?
5. Is the Philosophy section positioned correctly?

## Next Steps

1. Review proposal with stakeholders
2. Refine based on feedback
3. Update `docs/README.md`
4. Run build process to extract examples
5. Test all examples for correctness
6. Update snapshots
7. Deploy to website

---

**Summary:** The proposed changes maintain DyGram's core message while significantly improving the learning curve through graduated examples that incrementally demonstrate capabilities. The result is a more accessible, pedagogically sound homepage that better captures DyGram's vision of transforming thought into system.
