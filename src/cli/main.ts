import type { Machine } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { MachineLanguageMetaData } from '../language/generated/module.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode } from './cli-util.js';
import { generateJSON, generateMermaid } from './generator.js';
import { NodeFileSystem } from 'langium/node';
import * as url from 'node:url';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const packagePath = path.resolve(__dirname, '..', '..', 'package.json');
const packageContent = await fs.readFile(packagePath, 'utf-8');

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(fileName, services);
    await generateSerialized(fileName, opts)
    const generatedFilePath = generateJSON(model, fileName, opts.destination);
    console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
};

export const generateMermaidAction = async (file: string, opts: GenerateOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(file, services);
    await generateSerialized(file, opts)
    const generatedFilePath = generateMermaid(model, file, opts.destination);
    console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
}

export const generateSerialized = async (file: string, opts: GenerateOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(file, services);
    const json = services.serializer.JsonSerializer.serialize(model, { space: 2, sourceText: true, textRegions: true });
    const generatedFilePath = `${path.join(opts.destination || path.dirname(file), path.basename(file, path.extname(file)))}-raw.json`;
    fs.writeFile(generatedFilePath, json);
    console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
}

export type GenerateOptions = {
    destination?: string;
}

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = MachineLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JSON that represents the state machine')
        .action(generateAction);
    
    program
        .command('generate-mermaid')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates mermaid diagram that represents the state machine')
        .action(generateMermaidAction);

    program
        .command('debug')
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('outputs serialised ast')
        .action(generateSerialized);

    program.parse(process.argv);
}
