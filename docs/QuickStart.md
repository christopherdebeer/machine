# Quick Start

## Getting Started




### 01. INSTALLATION


        Install DyGram via npm:




```
npm install
```






### 02. DEVELOPMENT


        Start the development server:




```
npm run dev
```






### 03. CLI USAGE


        Execute .dygram files directly:




```
npx dygram your-file.dygram
```






## Your First Machine



        Create a file called `hello.dygram` with the following content:




### Example 1

```dygram quickstart-001
machine "Hello World"

state start;
state process;
state end;

start -> process -> end;
```

### Example 2

```dygram quickstart-002
machine "Task Processing"

state start;

Task processData {
  prompt: "Process the input data";
};

context output {
  result<string>: "";
};

state end;

start --> processData;
processData -stores-> output;
output --> end;
```

### Example 3

```dygram quickstart-003
machine "Context Management Demo"

state start;

Task generateContent {
  meta: true;
  prompt: "Generate content and store it using set_context_value";
};

context storage {
  content<string>: "";
  timestamp<number>: 0;
};

Task processContent {
  prompt: "Process the content: {{storage.content}}";
};

state end;

start --> generateContent;
generateContent -stores-> storage;
storage --> processContent;
processContent --> end;
```



        Run it:





```
node bin/cli.js execute hello.dygram
```





## Playground



        Try DyGram instantly in your browser without installation:



    [MOBILE PLAYGROUND →](playground-mobile.html)
    [MONACO PLAYGROUND →](playground.html)