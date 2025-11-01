# LLM Integration Examples

Working with language models and prompts.

## Basic LLM Task

Simple LLM-powered task:

```dy
machine "Text Analysis"

Context config {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
};

Task analyze {
    prompt: "Analyze the sentiment of the following text: {{ input.text }}";
};

Input input {
    text: "I love this product!";
};

Output result {
    sentiment: "TBD";
    confidence: 0.0;
};

input -> analyze -> result;
```

LLM basics:
- `Context` node configures model and parameters
- `prompt` attribute contains the LLM instruction
- Template syntax `{{ input.text }}` injects input values
- Linear flow: input → task → output

## Multi-Step Analysis

Chain of LLM tasks:

```dy
machine "Document Processing"

Context llm {
    model: "claude-3-5-sonnet-20241022";
};

Input document {
    content: #documentContent;
};

Task extract {
    prompt: "Extract key entities from: {{ document.content }}";
};

Task classify {
    prompt: "Classify the document based on entities: {{ extract.result }}";
};

Task summarize {
    prompt: "Summarize the document: {{ document.content }}";
};

Task combine {
    prompt: "Combine classification and summary: {{ classify.result }} + {{ summarize.result }}";
};

document -> extract -> classify -> combine;
document -> summarize -> combine;
```

Multi-step patterns:
- Sequential: `extract -> classify`
- Parallel: both `classify` and `summarize` feed into `combine`
- Reference previous task results: `{{ extract.result }}`
- Multiple paths from same input

## Conversational Agent

LLM-powered conversational workflow:

```dy
machine "Customer Support Bot"

Context agent {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 1024;
};

Input userMessage {
    text: "";
    history: [];
};

Task understand {
    prompt: "Understand the user's intent: {{ userMessage.text }}";
};

Task classify {
    prompt: "Classify as: question, complaint, or request";
};

State question "Question Intent";
State complaint "Complaint Intent";
State request "Request Intent";

Task answerQuestion {
    prompt: "Answer the question: {{ userMessage.text }}";
};

Task handleComplaint {
    prompt: "Address the complaint empathetically: {{ userMessage.text }}";
};

Task processRequest {
    prompt: "Process the request: {{ userMessage.text }}";
};

Output response {
    text: "";
    action: "";
};

userMessage -> understand -> classify;
classify -> question, complaint, request;
question -> answerQuestion -> response;
complaint -> handleComplaint -> response;
request -> processRequest -> response;
```

Conversational features:
- Intent classification routing
- State-based branching
- Context carries conversation history
- Different handlers for different intents

## Iterative Refinement

LLM workflow with feedback loop:

```dy
machine "Content Generator"

Context generation {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.8;
    attempts<number>: 0;
    max_attempts<number>: 3;
};

Input requirements {
    topic: "";
    tone: "";
    length<number>: 500;
};

Task generate {
    prompt: "Generate content on {{ requirements.topic }} with {{ requirements.tone }} tone, {{ requirements.length }} words";
};

Task evaluate {
    prompt: "Evaluate if content meets requirements. Score 0-10.";
};

State evaluating "Evaluating Quality";
State approved "Approved";
State needsRefinement "Needs Refinement";

Task refine {
    prompt: "Refine the content based on: {{ evaluate.feedback }}";
};

Output finalContent {
    text: "";
    score<number>: 0;
};

requirements -> generate -> evaluate -> evaluating;
evaluating -"score >= 8"-> approved -> finalContent;
evaluating -"score < 8 AND attempts < max_attempts"-> needsRefinement -> refine -> generate;
evaluating -"attempts >= max_attempts"-> approved -> finalContent;
```

Iterative pattern:
- Generation → evaluation → decision
- Loop back for refinement if needed
- Max attempts to prevent infinite loops
- Context tracks iteration count

## Multi-Model Collaboration

Using different models for different tasks:

```dy
machine "Research Assistant"

Input query {
    question: "";
};

Task quickAnalysis {
    model: "claude-3-5-haiku-20241022";
    temperature: 0.3;
    prompt: "Quick analysis: {{ query.question }}";
};

State simpleQuery "Simple Query";
State complexQuery "Complex Query";

Task deepAnalysis {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.7;
    max_tokens: 4096;
    prompt: "Deep analysis: {{ query.question }}. Previous: {{ quickAnalysis.result }}";
};

Task synthesize {
    model: "claude-3-5-sonnet-20241022";
    temperature: 0.5;
    prompt: "Synthesize findings from: {{ deepAnalysis.result }}";
};

Output answer {
    summary: "";
    detail: "";
};

query -> quickAnalysis;
quickAnalysis -"simple"-> simpleQuery -> answer;
quickAnalysis -"complex"-> complexQuery -> deepAnalysis -> synthesize -> answer;
```

Multi-model strategy:
- Fast model (Haiku) for initial triage
- Powerful model (Sonnet) for complex analysis
- Each task specifies its model
- Model choice based on complexity

## LLM with Tools

Task using function calling:

```dy
machine "Data Analyst"

Context config {
    model: "claude-3-5-sonnet-20241022";
    tools: ["calculator", "database_query", "chart_generator"];
};

Input dataRequest {
    query: "What were sales last quarter?";
};

Task analyzeRequest {
    prompt: "Analyze: {{ dataRequest.query }}. Use available tools.";
    tools: #availableTools;
};

Task executeTools {
    prompt: "Execute required tool calls";
};

Task synthesizeResults {
    prompt: "Synthesize results from tools: {{ executeTools.results }}";
};

Output report {
    findings: "";
    visualizations: [];
};

dataRequest -> analyzeRequest -> executeTools -> synthesizeResults -> report;
```

Tool usage patterns:
- Context defines available tools
- Task references tools with `tools` attribute
- Tool execution as separate task
- Synthesis combines tool outputs

## Next Steps

- **[Advanced Features](./advanced-features.md)** - Complex patterns and nesting
- **[Attributes & Types](./attributes-and-types.md)** - Type-safe attributes and schemas
- **[Workflows](./workflows.md)** - Combining LLMs with workflow patterns
