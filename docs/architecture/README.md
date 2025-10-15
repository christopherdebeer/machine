# DyGram Architecture

Documentation on DyGram's execution model, system architecture, and evolution patterns.

## Execution Model

### [Rails-Based Architecture](rails-based-architecture.md)
DyGram's unique execution model treating machine definitions as "rails":
- **Rails** - Machine structure defines the tracks
- **Single Agent** - One agent rides the tracks with phase-specific context
- **Automated Transitions** - Deterministic paths execute without LLM calls
- **Agent Decisions** - Complex branching requires agent reasoning
- **Meta-Programming** - Agent can construct tools and modify the machine

### [Runtime and Evolution](../RuntimeAndEvolution.mdx)
Runtime execution engine and automatic evolution:
- Task execution patterns
- Automatic code generation
- Pattern recognition and optimization
- Context management during execution
- Tool construction and registration

### [Evolution System](../Evolution.mdx)
System evolution from LLM exploration to optimized code:
- Starting with flexible LLM execution
- Automatic learning from execution patterns
- Progressive code generation
- Cost optimization over time

## Key Concepts

### Rails-Based Execution

The rails metaphor describes how DyGram executes workflows:

```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  Start  │────▶│ Process │────▶│   End   │
└─────────┘     └─────────┘     └─────────┘
                      │
                      ▼ (agent decides)
                ┌─────────┐
                │  Error  │
                └─────────┘
```

- **Automated paths**: Single outbound edge = automatic transition
- **Agent decisions**: Multiple options = agent evaluates and chooses
- **Meta-tasks**: Agent can inspect/modify the machine itself

### Evolution Pipeline

```
LLM Exploration → Pattern Recognition → Code Generation → Optimization
     (Day 1)           (Week 1-2)           (Week 3-4)        (Month 2+)
```

Tasks evolve from pure LLM execution to generated code as patterns emerge.

## Architecture Benefits

1. **Rapid Prototyping** - Start broad and unstructured, immediately executable
2. **Iterative Refinement** - Evolve through feedback and execution
3. **Cost Optimization** - Automatic transition from LLM to code reduces costs
4. **Flexibility** - Balance between exploration and optimization
5. **Meta-Programming** - Self-evolving systems that adapt at runtime

## Related Documentation

- [Meta-Programming Guide](../guides/meta-programming.md) - Dynamic machine modification
- [Context Guide](../guides/context-and-schema-guide.md) - Context management
- [Examples](../examples/rails.md) - Rails architecture examples
- [Runtime Examples](../examples/meta-programming.md) - Runtime modification examples
