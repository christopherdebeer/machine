import type { Machine } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { MachineLanguageMetaData } from '../language/generated/module.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode, extractDocument } from './cli-util.js';
import { generateJSON, generateMermaid, generateHTML } from './generator.js';
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

export const generateHTMLAction = async (file: string, opts: GenerateOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(file, services);
    await generateSerialized(file, opts)
    const generatedFilePath = generateHTML(model, file, opts.destination);
    console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
    console.log(chalk.blue('Tip: Open the HTML file in a browser to view the interactive diagram'));
}

export const generateSerialized = async (file: string, opts: SerialiseOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(file, services);
    const json = services.serializer.JsonSerializer.serialize(model, {
        space: 2,
        sourceText: opts.sourceText, 
        textRegions: opts.textRegions 
    });
    if (opts.destination) {
        console.log(opts.destination)
        const generatedFilePath = `${path.join(opts.destination || path.dirname(file), path.basename(file, path.extname(file)))}-raw.json`;
        fs.writeFile(generatedFilePath, json);
        console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
    } else {
        console.log(json);
    }
    
}

export type SerialiseOptions = {
    destination?: string;
    textRegions?: boolean;
    sourceText?: boolean;
}

export type GenerateOptions = {
    destination?: string;
}

/**
 * Parse and validate a program written in our language.
 * Verifies that no lexer or parser errors occur.
 * Implicitly also checks for validation errors while extracting the document
 *
 * @param fileName Program to validate
 */
export const parseAndValidate = async (fileName: string): Promise<void> => {
    // retrieve the services for our language
    const services = createMachineServices(NodeFileSystem).Machine;
    // extract a document for our program
    const document = await extractDocument(fileName, services);
    // extract the parse result details
    const parseResult = document.parseResult;
    // verify no lexer, parser, or general diagnostic errors show up
    if (parseResult.lexerErrors.length === 0 && 
        parseResult.parserErrors.length === 0
    ) {
        console.log(chalk.green(`Parsed and validated ${fileName} successfully!`));
    } else {
        console.log(chalk.red(`Failed to parse and validate ${fileName}!`));
    }
};

export default function(): void {
    const program = new Command();

    program.version(JSON.parse(packageContent).version);

    const fileExtensions = MachineLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .aliases(['g'])
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates JSON that represents the state machine')
        .action(generateAction);
    
    program
        .command('generate-mermaid')
        .aliases(['gm'])
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates mermaid diagram that represents the state machine')
        .action(generateMermaidAction);

    program
        .command('generate-html')
        .aliases(['gh'])
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('generates interactive HTML page with mermaid diagram')
        .action(generateHTMLAction);

    program
        .command('debug')
        .aliases(['d'])
        .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
        .option('-t, --text-regions', 'show positions of each syntax node', false)
        .option('-s, --source-text', 'show the source text of each syntax node', false)
        .option('-d, --destination <dir>', 'destination directory of generating')
        .description('outputs serialised ast')
        .action(generateSerialized);
    
    program.command('parseAndValidate')
        .aliases(['pv'])
        .argument('<file>', 'Source file to parse & validate (ending in ${fileExtensions})')
        .description('Indicates where a program parses & validates successfully, but produces no output code')
        .action(parseAndValidate);

    program.parse(process.argv);
}
