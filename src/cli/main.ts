import type { Machine } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { MachineLanguageMetaData } from '../language/generated/module.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode, extractDocument, extractDestinationAndName } from './cli-util.js';
import { MachineExecutor, type MachineData } from '../language/machine-executor.js';
import { generateJSON, generateMermaid, generateHTML, FileGenerationResult } from '../language/generator/generator.js';
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// Use __dirname compatible approach
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type GenerateFormat = 'json' | 'mermaid' | 'html';

interface GenerateOptions {
    destination?: string;
    format?: string;
    debug?: boolean;
}

const VALID_FORMATS: GenerateFormat[] = ['json', 'mermaid', 'html'];

function isValidFormat(format: string): format is GenerateFormat {
    return VALID_FORMATS.includes(format as GenerateFormat);
}

function parseFormats(formatStr?: string): GenerateFormat[] {
    if (!formatStr) {
        return ['json']; // Default to JSON only
    }

    const formats = formatStr.toLowerCase().split(',')
        .map(f => f.trim())
        .filter((f): f is GenerateFormat => {
            const valid = isValidFormat(f);
            if (!valid) {
                console.log(chalk.yellow(`Warning: Ignoring invalid format '${f}'. Valid formats are: ${VALID_FORMATS.join(', ')}`));
            }
            return valid;
        });

    return formats.length > 0 ? formats : ['json'];
}

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(fileName, services);
    if (opts.debug) await generateSerialized(fileName, opts);

    const formats = parseFormats(opts.format);
    const results: string[] = [];

    for (const format of formats) {
        try {
            let res: FileGenerationResult;
            switch (format) {
                case 'json':
                    res = generateJSON(model, fileName, opts.destination);
                    break;
                case 'mermaid':
                    res = generateMermaid(model, fileName, opts.destination);
                    break;
                case 'html':
                    res = generateHTML(model, fileName, opts.destination);
                    break;
            }
            if (opts.destination) results.push(chalk.green(`Generated ${format.toUpperCase()}: ${res.filePath}`));
            else console.log(res.content);
        } catch (error) {
            results.push(chalk.red(`Failed to generate ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`));
        }
    }

    if (opts.destination) {
        // Print all results together
        console.log('\nGeneration Results:');
        results.forEach(result => console.log(result));

        // If HTML was generated, show the tip
        if (formats.includes('html')) {
            console.log(chalk.blue('\nTip: Open the HTML file in a browser to view the interactive diagram'));
        }
    } else {
        console.log()
    }
    
};

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
        await fs.writeFile(generatedFilePath, json);
        console.log(chalk.green(`Output generated successfully: ${generatedFilePath}`));
    }
}

export type SerialiseOptions = {
    destination?: string;
    textRegions?: boolean;
    sourceText?: boolean;
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

/**
 * Execute a machine program
 * @param fileName Program to execute
 * @param opts Execution options
 */
export const executeAction = async (fileName: string, opts: { destination?: string }): Promise<void> => {
    // retrieve the services for our language
    const services = createMachineServices(NodeFileSystem).Machine;

    // Parse and validate the machine program
    const machine = await extractAstNode<Machine>(fileName, services);

    // Generate JSON representation for execution
    const jsonContent = generateJSON(machine, fileName, opts.destination);
    const machineData = JSON.parse(jsonContent.content) as MachineData;

    console.log(chalk.blue('Executing machine program...'));
    console.log(chalk.yellow('Machine structure:'));
    console.log(JSON.stringify(machineData, null, 2));

    // Execute the machine
    const executor = new MachineExecutor(machineData);
    const executionResult = await executor.execute();

    // Write execution results
    const data = extractDestinationAndName(fileName, opts.destination);
    const resultPath = path.join(data.destination, `${data.name}-result.json`);
    await fs.writeFile(resultPath, JSON.stringify(
        {
            ...executionResult,
            visitedNodes: Array.from(executionResult.visitedNodes),
            attributes: Object.fromEntries(executionResult.attributes)
        },
        null,
        2
    ));
    console.log(chalk.green(`Execution results written to: ${resultPath}`));
    console.log(chalk.blue('\nExecution path:'));
    executionResult.history.forEach(step => {
        console.log(`${step.from} --(${step.transition})--> ${step.to}`);
        if (step.output) {
            console.log(chalk.gray(`Output: ${step.output}`));
        }
    });
};

// Initialize CLI
function initializeCLI(): Promise<void> {
    return new Promise((resolve, reject) => {
        const packagePath = path.resolve(__dirname, '..', '..', 'package.json');
        fs.readFile(packagePath, 'utf-8')
            .then(packageContent => {
                const program = new Command();
                program.version(JSON.parse(packageContent).version);

                const fileExtensions = MachineLanguageMetaData.fileExtensions.join(', ');
                program
                    .command('generate')
                    .aliases(['g'])
                    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
                    .option('-d, --destination <dir>', 'destination directory for generated files')
                    .option('--debug', 'debug output raw ast', false)
                    .option('-f, --format <formats>',
                        'comma-separated list of output formats (json,mermaid,html). Default: json',
                        'json')
                    .description('generates output in specified formats (json, mermaid, html)')
                    .action(generateAction);

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

                program
                    .command('execute')
                    .aliases(['exec', 'e'])
                    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
                    .option('-d, --destination <dir>', 'destination directory for execution results')
                    .description('executes a machine program')
                    .action(executeAction);

                program.parse(process.argv);
                resolve();
            })
            .catch(reject);
    });
}

// Export default function that initializes CLI
export default async function(): Promise<void> {
    try {
        await initializeCLI();
    } catch (error) {
        console.error('Failed to initialize CLI:', error);
        process.exit(1);
    }
}
