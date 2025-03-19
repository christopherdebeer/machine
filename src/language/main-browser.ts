import { DocumentState, EmptyFileSystem } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { BrowserMessageReader, BrowserMessageWriter, createConnection, Diagnostic, NotificationType } from 'vscode-languageserver/browser.js';
import { createMachineServices, MachineJSON } from './machine-module.js';
import { Machine } from './generated/ast.js';
import { generateJSON, generateMermaid } from './generator/generator.js';

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
// listen on fully validated documents
services.shared.workspace.DocumentBuilder.onBuildPhase(DocumentState.Validated, documents => {
    // perform this for every validated document in this build phase batch
    for (const document of documents) {
        const model = document.parseResult.value as Machine;
        let json: MachineJSON = {title: "", nodes: [], edges: []};
        let mermaid: string = "";

        // only generate commands if there are no errors
        if(document.diagnostics === undefined 
            || document.diagnostics.filter((i) => i.severity === 1).length === 0
            ) {
            json = JSON.parse(generateJSON(model, document.textDocument.uri, undefined).content);
            mermaid = generateMermaid(model, document.textDocument.uri, undefined).content;
        }
        
        // inject the commands into the model
        // this is safe so long as you careful to not clobber existing properties
        // and is incredibly helpful to enrich the feedback you get from the LS per document
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

