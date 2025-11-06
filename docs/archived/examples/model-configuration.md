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


**Use case**: Cost optimization by using fast/cheap models for simple tasks and more capable models only when needed.

### Machine-Level Model (`machine-level-model.dygram`)

Demonstrates setting a default model for all tasks in a machine:


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

### `machine-level-model.dygram`
Cost-Optimized System

```dy examples/model-configuration/machine-level-model.dygram
machine "Cost-Optimized System"

// Machine-level configuration using haiku for all tasks (unless overridden)
config {
    modelId: "claude-3-5-haiku-20241022";
    desc: "Use haiku by default for cost optimization";
};

state start;

// Uses machine-level default (haiku)
Task task1 {
    meta: true;
    prompt: "Perform a simple classification task.";
};

// Uses machine-level default (haiku)
Task task2 {
    meta: true;
    prompt: "Generate a short summary.";
};

// Override with sonnet for this specific complex task
Task complex_task {
    meta: true;
    modelId: "claude-3-5-sonnet-20241022";
    prompt: "Perform complex reasoning that requires more capable model.";
};

state complete;

// Workflow
start -> task1;
task1 -> task2;
task2 -> complex_task;
complex_task -> complete;

```

### `task-specific-models.dygram`

Multi-Model Task System

```dy examples/model-configuration/task-specific-models.dygram
machine "Multi-Model Task System"

// Example demonstrating task-specific model ID configuration
// Different tasks can use different Claude models based on complexity

state start;

// Simple task using default (haiku - fast and cheap)
Task quick_analysis {
    meta: true;
    prompt: "Provide a quick one-sentence summary of what this system does.";
};

// Complex task requiring more capable model
Task deep_analysis {
    meta: true;
    modelId: "claude-3-5-sonnet-20241022";
    prompt: "Perform an in-depth analysis of the implications of using different AI models for different tasks. Consider cost, latency, and quality trade-offs.";
};

// Critical task requiring most capable model
Task strategic_decision {
    meta: true;
    modelId: "claude-3-opus-20240229";
    prompt: "Make a strategic recommendation on model selection strategy for a production system. Consider all factors including cost, performance, and reliability.";
};

context analysis {
    quickSummary<string>: "";
    deepAnalysis<string>: "";
    recommendation<string>: "";
};

state complete {
    desc: "Multi-model execution complete";
};

// Workflow
start -> quick_analysis;
quick_analysis -writes-> analysis;
analysis -> deep_analysis;
deep_analysis -writes-> analysis;
analysis -> strategic_decision;
strategic_decision -writes-> analysis;
analysis -> complete;

```
