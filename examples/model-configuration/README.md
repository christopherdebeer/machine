# Model Configuration Examples

This directory demonstrates how to configure Claude model IDs at different levels in your machine programs.

## Overview

The Machine DSL supports flexible model ID configuration with the following priority order:

1. **Task-level** (highest priority) - Specific tasks can override the model
2. **CLI parameter** - Command-line `--model` flag
3. **Machine-level** - Default for all tasks in the machine
4. **Environment variable** - `ANTHROPIC_MODEL_ID`
5. **Default** (lowest priority) - `claude-3-5-haiku-20241022`

## Examples

### Task-Specific Models (`task-specific-models.dygram`)

Demonstrates using different models for different tasks based on complexity:

```dygram
Task quick_analysis {
    meta: true;
    prompt: "Quick summary...";
    // Uses default (haiku)
};

Task deep_analysis {
    meta: true;
    modelId: "claude-3-5-sonnet-20241022";
    prompt: "Deep analysis...";
};

Task strategic_decision {
    meta: true;
    modelId: "claude-3-opus-20240229";
    prompt: "Strategic recommendation...";
};
```

**Use case**: Cost optimization by using fast/cheap models for simple tasks and more capable models only when needed.

### Machine-Level Model (`machine-level-model.dygram`)

Demonstrates setting a default model for all tasks in a machine:

```dygram
machine "Cost-Optimized System"

config {
    modelId: "claude-3-5-haiku-20241022";
};

Task task1 {
    meta: true;
    prompt: "Uses haiku (from machine config)...";
};

Task complex_task {
    meta: true;
    modelId: "claude-3-5-sonnet-20241022";  // Override
    prompt: "Uses sonnet (task override)...";
};
```

**Use case**: Set a sensible default for the entire machine while allowing specific tasks to override.

## Running the Examples

### Default (uses haiku):
```bash
dygram execute examples/model-configuration/task-specific-models.dygram
```

### Override via CLI (all tasks use sonnet):
```bash
dygram execute examples/model-configuration/task-specific-models.dygram --model claude-3-5-sonnet-20241022
```

### Override via environment:
```bash
export ANTHROPIC_MODEL_ID=claude-3-opus-20240229
dygram execute examples/model-configuration/task-specific-models.dygram
```

## Available Models

- **Haiku** (default): `claude-3-5-haiku-20241022` - Fast and cost-effective
- **Sonnet**: `claude-3-5-sonnet-20241022` - Balanced performance
- **Opus**: `claude-3-opus-20240229` - Most capable

## Best Practices

1. **Use haiku by default**: Set machine-level to haiku for cost optimization
2. **Override strategically**: Use sonnet/opus only for complex tasks
3. **Document choices**: Add comments explaining why specific models are chosen
4. **Test with different models**: Use CLI override to test performance/cost trade-offs
