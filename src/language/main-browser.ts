import { DocumentState, EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { BrowserMessageReader, BrowserMessageWriter, createConnection, Diagnostic, NotificationType } from 'vscode-languageserver/browser.js';
import { createMachineServices, MachineJSON } from './machine-module.js';
import { Machine } from './generated/ast.js';
import { generateJSON, generateGraphviz } from './generator/generator.js';

declare const self: DedicatedWorkerGlobalScope;

const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

const services = createMachineServices({ connection, ...EmptyFileSystem });

console.log('Starting Language Server...')

console.log(connection, services)

startLanguageServer(services.shared);

// Send a notification with the serialized AST after every document change
type DocumentChange = { uri: string, content: string, diagnostics: Diagnostic[] };
const documentChangeNotification = new NotificationType<DocumentChange>('browser/DocumentChange');
// use the built-in AST serializer
const jsonSerializer = services.Machine.serializer.JsonSerializer;
/**
 * Generate an error diagram showing parse/validation errors using Graphviz DOT format
 */
function generateErrorDiagram(diagnostics: Diagnostic[]): string {
    const errors = diagnostics.filter(d => d.severity === 1); // Severity 1 = Error

    if (errors.length === 0) {
        return "";
    }

    const escapeLabel = (str: string) => str.replace(/"/g, '\\"').replace(/\n/g, '\\n');

    let diagram = `digraph {\n`;
    diagram += `  // Graph attributes\n`;
    diagram += `  rankdir=TB;\n`;
    diagram += `  node [shape=box, fontname="Arial", fontsize=12];\n\n`;

    diagram += `  ErrorHeader [label="⚠️ Parse Errors Detected (${errors.length})", `;
    diagram += `fillcolor="#ff6b6b", style=filled, fontcolor=white];\n\n`;

    errors.forEach((error, index) => {
        const errorId = `E${index}`;
        const line = error.range.start.line + 1; // Convert 0-based to 1-based
        const col = error.range.start.character + 1;
        const message = escapeLabel(error.message);

        diagram += `  ${errorId} [label="Line ${line}:${col}\\n${message}", `;
        diagram += `fillcolor="#ffe0e0", style=filled, color="#ff6b6b"];\n`;
        diagram += `  ErrorHeader -> ${errorId};\n`;
    });

    diagram += `}\n`;
    return diagram;
}

// listen on fully validated documents
services.shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Validated, documents => {
    // perform this for every validated document in this build phase batch
    for (const document of documents) {
        const model = document.parseResult.value as Machine;
        let json: MachineJSON = {title: "", nodes: [], edges: []};
        let mermaid: string = "";

        const hasErrors = document.diagnostics !== undefined 
            && document.diagnostics.filter((i) => i.severity === 1).length > 0;

        // only generate commands if there are no errors
        if(!hasErrors) {
            json = JSON.parse(generateJSON(model, document.textDocument.uri, undefined).content);
            mermaid = generateGraphviz(model, document.textDocument.uri, undefined).content;
        } else {
            // Generate error diagram to show parse errors visually
            mermaid = generateErrorDiagram(document.diagnostics!);
        }

        // inject the commands into the model
        // this is safe so long as you careful to not clobber existing properties
        // and is incredibly helpful to enrich the feedback you get from the LS per document
        // Note: $mermaid property name kept for backwards compatibility, but now contains DOT/Graphviz format
        (model as unknown as {$data: MachineJSON, $mermaid: string}).$data = json;
        (model as unknown as {$data: MachineJSON, $mermaid: string}).$mermaid = mermaid;

        // send the notification for this validated document,
        // with the serialized AST + generated commands as the content
        connection.sendNotification(documentChangeNotification, {
            uri: document.uri.toString(),
            content: jsonSerializer.serialize(model, { sourceText: true, textRegions: true }),
            diagnostics: document.diagnostics ?? []
        });
    }
});


console.log('Language Server started')
