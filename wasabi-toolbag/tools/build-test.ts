import { exec } from 'child_process';

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

interface BuildTestParams {
  skipTests?: boolean;
  testPattern?: string;
}

class BuildTestTool {
  constructor(private context: ToolContext) {}

  readonly name = 'BuildTestTool';

  public confirmation = () => ({ proceed: true });

  readonly inputSchema = {
    json: {
      type: 'object',
      properties: {
        skipTests: {
          type: 'boolean',
          description: 'Skip running tests after build (default: false)'
        },
        testPattern: {
          type: 'string',
          description: 'Optional pattern to filter which tests to run (e.g., "parsing" to run only parsing tests)'
        }
      }
    }
  };

  description = 'Builds the project and optionally runs tests';

  async execute(params: BuildTestParams) {
    const { skipTests = false, testPattern } = params;

    return new Promise<{}>((resolve) => {
      // First run the build
      exec('npm run build', { cwd: this.context.rootDir }, (buildError, buildStdout, buildStderr) => {
        const buildResult = {
          phase: 'build',
          success: !buildError,
          output: buildStdout,
          errors: buildStderr
        };

        if (buildError || skipTests) {
          resolve({
            status: buildError ? 'error' : 'success',
            message: buildError ? 'Build failed:' : 'Build completed successfully:',
            build: buildResult
          });
          return;
        }

        // If build succeeded and tests weren't skipped, run tests
        const testCommand = testPattern
          ? `npm test -- ${testPattern}`
          : 'npm test';

        exec(testCommand, { cwd: this.context.rootDir }, (testError, testStdout, testStderr) => {
          const testResult = {
            phase: 'test',
            success: !testError,
            output: testStdout,
            errors: testStderr
          };

          resolve({
            status: testError ? 'error' : 'success',
            message: testError ? 'Tests failed:' : 'Build and tests completed successfully:',
            build: buildResult,
            test: testResult
          });
        });
      });
    });
  }
}

export default BuildTestTool;
