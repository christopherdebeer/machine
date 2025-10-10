import type { LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';

let client: LanguageClient;

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

function startLanguageClient(context: vscode.ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`] };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: '*', language: 'machine' }]
    };

    // Create the language client and start the client.
    const client = new LanguageClient(
        'machine',
        'Machine',
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    client.start();
    return client;
}

export function activate(context: vscode.ExtensionContext) {
    client = startLanguageClient(context);
    let disposable = vscode.commands.registerCommand('extension.generateAndPreview', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        // Execute the task
        const task = await vscode.tasks.executeTask(new vscode.Task(
            { type: 'shell' },
            vscode.TaskScope.Workspace,
            'generate mermaid output',
            'shell',
            new vscode.ShellExecution(`dygram generate --format html ${activeEditor.document.fileName} -d ${path.dirname(activeEditor.document.fileName)}`)
        ));

        // Wait for task completion
        const res = await new Promise<vscode.TaskExecution>((resolve) => {
            const disposable = vscode.tasks.onDidEndTask((e) => {
                if (e.execution === task) {
                    disposable.dispose();
                    resolve(e.execution);
                }
            });
        });

        console.log(`Lets get the generated html`, res)

        // Create and show preview panel
        const panel = vscode.window.createWebviewPanel(
            'mermaidPreview',
            'DyGram Preview',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'out', 'extension', 'web'))
                ]
            }
        );

        // Load and display the generated file
        const outputPath = path.join(
            path.dirname(activeEditor.document.fileName),
            path.basename(activeEditor.document.fileName, path.extname(activeEditor.document.fileName)) + '.html'
        );
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(outputPath));
        
        // Inject the web executor script into the HTML content
        const htmlContent = content.toString();

        panel.webview.html = htmlContent;
    });

    context.subscriptions.push(disposable);
}
