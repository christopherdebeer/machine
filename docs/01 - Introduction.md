# Machine-lang

Machine is a Domain Specific Language _(DSL)_ for rapid prototyping of dynamic state machine workflows.

## syntax


```machine
machine "my machine title"

one;
two;
three;

one -next-> three;
```

1. [Basic machine syntax](./examples/01%20-%20basic.mach)


## Visualization

TODO: Explain visualization


## Execution

TODO: Explain the execution engine.


## CLI (Command-line Interface)

```sh
$ machine generate --format mermaid ./examples/basic/mach
```