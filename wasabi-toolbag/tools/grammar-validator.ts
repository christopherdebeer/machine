import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

interface ToolContext {
  readonly fs: typeof import('fs');
  readonly path: typeof import('path');
  readonly os: typeof import('os');
  readonly process: typeof import('process');
  readonly httpClient: {
    request<TInput = unknown, TOutput = unknown>(
      url: URL,
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD',
      options?: {
        timeout?: number;
        retryStrategy?: { maxAttempts: number; maxElapsedTime: number };
        body?: TInput;
        headers?: Record<string, string>;
        compression?: 'gzip' | 'br';
        doNotParse?: TOutput extends Buffer ? boolean : never;
      }
    ): Promise<{ statusCode: number; headers: Record<string, string | string[] | undefined>; body: TOutput }>;
  };
  readonly rootDir: string;
  readonly validFileGlobs: string[];
  readonly excludedFileGlobs: string[];
}

interface GrammarValidatorParams {
  files?: string[];
  generateAst?: boolean;
}

class GrammarValidatorTool {
  constructor(private context: ToolContext) {}

  readonly name = 'GrammarValidatorTool';

  readonly inputSchema = {
    json: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of specific files to validate. If not provided, uses example files from examples/ directory'
        },
        generateAst: {
          type: 'boolean',
          description: 'Whether to generate and include AST output (default: false)'
        }
      }
    }
  };

  description = 'Validates machine grammar files against example files and reports any parsing errors';

  async execute(params: GrammarValidatorParams) {
    const { files = [], generateAst = false } = params;

    // If no files specified, use examples directory
    const filesToValidate = files.length > 0 ? files : ['examples/example.mach'];

    // Build the project first to ensure latest grammar
    return new Promise<{}>((resolve) => {
      exec('npm run build', { cwd: this.context.rootDir }, (buildError) => {
        if (buildError) {
          resolve({
            status: 'error',
            message: 'Error building project:',
            error: buildError.message
          });
          return;
        }

        const results: any[] = [];
        let hasErrors = false;

        // Process each file
        filesToValidate.forEach(file => {
          try {
            const fullPath = join(this.context.rootDir, file);
            const content = readFileSync(fullPath, 'utf8');

            // Use the CLI to validate
            exec(`node ./out/cli/main.js generate ${generateAst ? '--ast' : ''} "${file}"`,
                 { cwd: this.context.rootDir },
                 (error, stdout, stderr) => {
              const result = {
                file,
                valid: !error,
                output: stdout,
                errors: stderr
              };

              if (error) {
                hasErrors = true;
              }

              if (generateAst && !error) {
                try {
                  // Try to read the generated AST file
                  const astPath = file.replace(/\.[^/.]+$/, '.json');
                  const ast = readFileSync(join(this.context.rootDir, 'examples/out', astPath), 'utf8');
                  result.ast = JSON.parse(ast);
                } catch (astError) {
                  result.astError = 'Failed to read AST output';
                }
              }

              results.push(result);

              // If this was the last file, resolve with results
              if (results.length === filesToValidate.length) {
                resolve({
                  status: hasErrors ? 'error' : 'success',
                  message: hasErrors ? 'Grammar validation found errors:' : 'Grammar validation successful:',
                  results
                });
              }
            });
          } catch (error) {
            results.push({
              file,
              valid: false,
              error: error.message
            });

            hasErrors = true;

            // If this was the last file, resolve with results
            if (results.length === filesToValidate.length) {
              resolve({
                status: 'error',
                message: 'Grammar validation found errors:',
                results
              });
            }
          }
        });
      });
    });
  }
}

export default GrammarValidatorTool;
