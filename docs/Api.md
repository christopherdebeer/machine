# API Reference

return <ApiContent />
    ;

    return (



## Programmatic API



                        Use DyGram as a library in your Node.js applications.





### INSTALLATION




```
npm install dygram
```






### PARSING


                        Parse DyGram source code into an Abstract Syntax Tree (AST):




```
{`import { createMachineServices } from 'dygram';
import { EmptyFileSystem } from 'langium';

const services = createMachineServices(EmptyFileSystem);
const parser = services.Machine.parser.LangiumParser;

const code = \`machine "Example"
  state a;
  state b;
  a -> b;\`;

const result = parser.parse(code);

if (result.lexerErrors.length === 0 &&
    result.parserErrors.length === 0) {
  console.log('Parsed successfully!');
  console.log(result.value);
}`}
```






### CONTEXT MANAGEMENT


                        Execute machines with enhanced context value management:




```
import { MachineExecutor } from 'dygram';

const machineData = {
  title: "Context Demo",
  nodes: [
    { name: "start", type: "state" },
    { name: "process", type: "Task", attributes: [
      { name: "meta", value: "true" },
      { name: "prompt", value: "Generate data and store using set_context_value" }
    ]},
    { name: "output", type: "context", attributes: [
      { name: "result", type: "string", value: "" }
    ]}
  ],
  edges: [
    { source: "start", target: "process" },
    { source: "process", target: "output" }
  ]
};

const config = {
  llm: {
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-3-5-sonnet-20241022'

};

const executor = await MachineExecutor.create(machineData, config);
const result = await executor.execute();
```






### VALIDATION


                        Validate DyGram code and get diagnostic messages:




```
{`import { createMachineServices } from 'dygram';
import { EmptyFileSystem } from 'langium';

const services = createMachineServices(EmptyFileSystem);
const validator = services.Machine.validation.DocumentValidator;

// Parse and validate
const document = await services.shared.workspace
  .LangiumDocuments.getOrCreateDocument(uri, code);

const diagnostics = await validator.validateDocument(document);

diagnostics.forEach(diag => {
  console.log(\`\${diag.severity}: \${diag.message}\`);
});`}
```






### DIAGRAM GENERATION


                        Generate Mermaid diagrams from DyGram code:




```
{`import { generateMermaid } from 'dygram/cli';

const code = \`machine "Flow"
  state start;
  state end;
  start -> end;\`;

const mermaid = generateMermaid(code);
console.log(mermaid);

// Output:
// graph TD
//   start --> end`}
```






## CLI Commands



                            DyGram provides a command-line interface:






### EXECUTE




```
npx dygram file.mach
```


                                Execute a DyGram file






### VALIDATE




```
npx dygram validate file.mach
```


                                Check syntax and semantics






### EXPORT




```
npx dygram export --format mermaid file.mach
```


                                Generate diagrams and documentation








## TypeScript Support



                            DyGram is written in TypeScript and provides full type definitions for all APIs.




                            See the [GitHub repository](https://github.com/christopherdebeer/machine) for detailed type information and source code.






        );