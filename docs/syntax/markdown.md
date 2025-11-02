# Markdown Formatting

DyGram supports markdown formatting in text fields throughout your diagrams. Markdown is processed using a custom renderer that outputs Graphviz-compatible HTML.

## Supported Markdown Features

### Bold Text

Use `**text**` or `__text__` for bold formatting:

```dygram examples/syntax/markdown-bold.dygram
machine "Markdown Demo"

state Process "**Important** processing step"
```

### Italic Text

Use `*text*` or `_text_` for italic formatting:

```dygram examples/syntax/markdown-italic.dygram
machine "Markdown Demo"

state Review "*Review carefully* before proceeding"
```

### Strikethrough

Use `~~text~~` for strikethrough:

```dygram examples/syntax/markdown-strikethrough.dygram
machine "Markdown Demo"

state Deprecated "~~Old method~~ Use new API"
```

### Inline Code

Use backticks for inline code with monospace font:

```dygram examples/syntax/markdown-code.dygram
machine "Markdown Demo"

state Execute "Run `npm install` to install dependencies"
```

### Links

Use `[text](url)` for links (shown as underlined text):

```dygram examples/syntax/markdown-links.dygram
machine "Markdown Demo"

state Docs "See [documentation](https://example.com) for details"
```

### Combined Formatting

You can combine multiple markdown styles:

```dygram examples/syntax/markdown-combined.dygram
machine "Markdown Demo"

state Task "**Critical**: Run `npm test` *before* deployment"
```

## Where Markdown Works

### Node Titles

Markdown formatting in node title strings:

```dygram examples/syntax/markdown-node-titles.dygram
machine "Markdown in Nodes"

state Validate "**Validate** input with `schema.check()`"
state Transform "*Transform* data to **JSON**"

Validate --> Transform
```

### Node Descriptions

Markdown in desc and prompt attributes:

```dygram examples/syntax/markdown-descriptions.dygram
machine "Markdown in Descriptions"

state Process {
    desc: "Process data using **fast** algorithm"
}

state Verify {
    prompt: "Verify with `checksum` *before* saving"
}

Process --> Verify
```

### Attribute Values

Markdown in attribute values:

```dygram examples/syntax/markdown-attributes.dygram
machine "Markdown in Attributes"

state Deploy {
    environment: "**production**"
    command: "`kubectl apply -f config.yaml`"
    note: "*Check logs* after deployment"
}
```

### Edge Labels

Markdown in edge labels:

```dygram examples/syntax/markdown-edges.dygram
machine "Markdown in Edges"

state Start
state End

Start --> End { text: "**Success** with `status=200`" }
```

### Notes

Markdown in note content:

```dygram examples/syntax/markdown-notes.dygram
machine "Markdown in Notes"

state Process

note Process "**Important**: Use `--force` flag *only* in [test environment](https://test.example.com)"
```

## Complete Example

A comprehensive example showing markdown in various locations:

```dygram examples/syntax/markdown-comprehensive.dygram
machine "**API Gateway** Documentation"

state Config {
    apiKey: "`$ENV_API_KEY`"
    endpoint: "[API Docs](https://api.example.com)"
}

state Authenticate "**Authenticate** using *OAuth 2.0*" {
    method: "`POST /auth/token`"
    desc: "Verify credentials with **strong** validation"
}

state FetchData "*Fetch* data from **remote** API" {
    timeout: "~~5s~~ **30s**"
}

state Error "Handle `4xx` and `5xx` errors"

Config --> Authenticate { text: "**POST** to `/auth`" }
Authenticate --> FetchData { text: "*Authenticated* request" }
FetchData --> Error { text: "On **failure**" }

note Authenticate "Use `Bearer` token in **Authorization** header"
```
