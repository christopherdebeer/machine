/**
 * Vitest global setup to ensure Langium files are generated before tests run
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export async function setup() {
    const generatedModulePath = resolve(__dirname, '../../src/language/generated/module.ts');

    // Check if Langium files are already generated
    if (!existsSync(generatedModulePath)) {
        console.log('Generating Langium files...');
        try {
            execSync('npm run langium:generate', {
                cwd: resolve(__dirname, '../..'),
                stdio: 'inherit'
            });
            console.log('Langium files generated successfully');
        } catch (error) {
            console.error('Failed to generate Langium files:', error);
            throw error;
        }
    }
}

export async function teardown() {
    // Nothing to clean up
}
