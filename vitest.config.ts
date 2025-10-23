/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            // Resolve .js imports to .ts files for Langium generated modules
            './generated/module.js': path.resolve(__dirname, 'src/language/generated/module.ts'),
            './generated/ast.js': path.resolve(__dirname, 'src/language/generated/ast.ts'),
            './generated/grammar.js': path.resolve(__dirname, 'src/language/generated/grammar.ts'),
        },
        extensions: ['.ts', '.js', '.json']
    },
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'json-summary', 'json'],
            reportsDirectory: 'test-output/coverage',
            include: ['src/**/*.ts'],
            exclude: [
                '**/generated/**',
                '**/node_modules/**',
                '**/test/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/shims/**',
            ],
        },
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts'],
        exclude: ['**/e2e/**', '**/node_modules/**'],
        reporters: ['default', 'junit'],
        outputFile: {
            junit: 'test-output/vitest/junit.xml'
        },
        // Ensure langium files are generated before tests run
        globalSetup: ['./test/setup/vitest-setup.ts']
    }
});
