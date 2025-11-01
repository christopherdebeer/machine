import type { Machine } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { MachineLanguageMetaData } from '../language/generated/module.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode, extractDocument, extractDestinationAndName } from './cli-util.js';
import { RailsExecutor, type MachineData } from '../language/rails-executor.js';
import { generateJSON, generateHTML, generateDSL, generateGraphviz, FileGenerationResult } from '../language/generator/generator.js';
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from './logger.js';
import { glob } from 'glob';
import { spawn } from 'node:child_process';

// Use __dirname compatible approach
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// Handle both bundled and unbundled cases
let __dirname: string;
try {
    const __filename = fileURLToPath(import.meta.url);
    __dirname = dirname(__filename);
} catch {
    // Fallback for bundled CommonJS - assume we're in out/cli and go up to project root
    __dirname = path.resolve(process.cwd(), 'out', 'cli');
}

type GenerateFormat = 'json' | 'html' | 'dsl' | 'graphviz' | 'dot';

interface GenerateOptions {
    destination?: string;
    format?: string;
    debug?: boolean;
    verbose?: boolean;
    quiet?: boolean;
}

interface BatchOptions {
    destination?: string;
    format?: string;
    continueOnError?: boolean;
    verbose?: boolean;
    quiet?: boolean;
}

const VALID_FORMATS: GenerateFormat[] = ['json', 'html', 'dsl', 'graphviz', 'dot'];

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
                logger.warn(`Warning: Ignoring invalid format '${f}'. Valid formats are: ${VALID_FORMATS.join(', ')}`);
            }
            return valid;
        });

    return formats.length > 0 ? formats : ['json'];
}

function setupLogger(opts: { verbose?: boolean; quiet?: boolean }): void {
    if (opts.quiet) {
        logger.setLevel('quiet');
    } else if (opts.verbose) {
        logger.setLevel('verbose');
    } else {
        logger.setLevel('normal');
    }
}

export const generateAction = async (fileName: string, opts: GenerateOptions): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;

    logger.debug(`Processing file: ${fileName}`);

    const formats = parseFormats(opts.format);

    // Check if we need to handle DSL format specially (requires JSON input)
    if (formats.includes('dsl')) {
        await generateDSLAction(fileName, opts, formats);
        return;
    }

    // Standard DSL input processing
    const model = await extractAstNode<Machine>(fileName, services);
    if (opts.debug) await generateSerialized(fileName, opts);

    const results: string[] = [];

    for (const format of formats) {
        try {
            let res: FileGenerationResult | undefined;
            switch (format) {
                case 'json':
                    res = generateJSON(model, fileName, opts.destination);
                    break;
                case 'graphviz':
                case 'dot':
                    res = generateGraphviz(model, fileName, opts.destination);
                    break;
                case 'html':
                    res = generateHTML(model, fileName, opts.destination);
                    break;
                default:
                    logger.warn(`Format '${format}' is not supported for DSL input`);
                    continue;
            }
            if (res) {
                if (opts.destination) {
                    results.push(`Generated ${format.toUpperCase()}: ${res.filePath}`);
                    logger.debug(`Wrote ${format} to ${res.filePath}`);
                } else {
                    logger.output(res.content);
                }
            }
        } catch (error) {
            const errorMsg = `Failed to generate ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`;
            results.push(errorMsg);
            logger.error(errorMsg);
        }
    }

    if (opts.destination) {
        // Print all results together
        logger.heading('\n✓ Generation Complete');
        results.forEach(result => logger.success('  ' + result));

        // If HTML was generated, show the tip
        if (formats.includes('html')) {
            logger.tip('\n💡 Tip: Open the HTML file in a browser to view the interactive diagram');
        }
    }
};

async function generateDSLAction(fileName: string, opts: GenerateOptions, formats: GenerateFormat[]): Promise<void> {
    // DSL format requires JSON input
    if (!fileName.endsWith('.json')) {
        logger.error('DSL format generation requires a JSON input file');
        process.exit(1);
    }

    logger.debug(`Reading JSON from: ${fileName}`);

    // Read JSON file
    const jsonContent = await fs.readFile(fileName, 'utf-8');
    const machineJson = JSON.parse(jsonContent);

    const results: string[] = [];

    for (const format of formats) {
        try {
            if (format === 'dsl') {
                // Generate DSL from JSON
                const dslContent = generateDSL(machineJson);

                if (opts.destination) {
                    // Write to file
                    const data = extractDestinationAndName(fileName, opts.destination);
                    const outputPath = path.join(data.destination, `${data.name}.dygram`);
                    await fs.mkdir(data.destination, { recursive: true });
                    await fs.writeFile(outputPath, dslContent);
                    results.push(`Generated DSL: ${outputPath}`);
                    logger.debug(`Wrote DSL to ${outputPath}`);
                } else {
                    logger.output(dslContent);
                }
            } else {
                logger.warn(`Format '${format}' is not supported when generating from JSON. Only 'dsl' format is supported.`);
            }
        } catch (error) {
            const errorMsg = `Failed to generate ${format.toUpperCase()}: ${error instanceof Error ? error.message : String(error)}`;
            results.push(errorMsg);
            logger.error(errorMsg);
        }
    }

    if (opts.destination && results.length > 0) {
        logger.heading('\n✓ Generation Complete');
        results.forEach(result => logger.success('  ' + result));
    }
}

export const generateSerialized = async (file: string, opts: SerialiseOptions & { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(file, services);
    const json = services.serializer.JsonSerializer.serialize(model, {
        space: 2,
        sourceText: opts.sourceText,
        textRegions: opts.textRegions
    });
    if (opts.destination) {
        logger.debug(`Writing to: ${opts.destination}`);
        const generatedFilePath = `${path.join(opts.destination || path.dirname(file), path.basename(file, path.extname(file)))}-raw.json`;
        await fs.writeFile(generatedFilePath, json);
        logger.success(`Output generated successfully: ${generatedFilePath}`);
    } else {
        logger.output(json);
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
export const parseAndValidate = async (fileName: string, opts?: { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts || {});

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
        logger.success(`✓ Parsed and validated ${fileName} successfully!`);
    } else {
        logger.error(`✗ Failed to parse and validate ${fileName}!`);
        if (parseResult.lexerErrors.length > 0) {
            logger.error('\nLexer errors:');
            parseResult.lexerErrors.forEach(err => logger.error(`  ${err.message}`));
        }
        if (parseResult.parserErrors.length > 0) {
            logger.error('\nParser errors:');
            parseResult.parserErrors.forEach(err => logger.error(`  ${err.message}`));
        }
    }
};

/**
 * Execute a machine program
 * @param fileName Program to execute
 * @param opts Execution options
 */
export const executeAction = async (fileName: string, opts: { destination?: string; model?: string; verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts);

    // retrieve the services for our language
    const services = createMachineServices(NodeFileSystem).Machine;

    // Parse and validate the machine program
    const machine = await extractAstNode<Machine>(fileName, services);

    // Generate JSON representation for execution
    const jsonContent = generateJSON(machine, fileName, opts.destination);
    const machineData = JSON.parse(jsonContent.content) as MachineData;

    logger.info(chalk.blue('\n⚙️  Executing machine program with Rails-Based Architecture...'));

    // Extract model ID from machine-level or config node
    let machineModelId: string | undefined;

    // Check for machine-level modelId attribute (first priority for machine config)
    const machineNode = machineData.nodes.find(n => n.type === 'machine' || n.name === machineData.title);
    if (machineNode?.attributes) {
        const modelAttr = machineNode.attributes.find(a => a.name === 'modelId' || a.name === 'model');
        if (modelAttr?.value) {
            machineModelId = String(modelAttr.value).replace(/^["']|["']$/g, '');
        }
    }

    // Fall back to config nodes if machine-level not found
    if (!machineModelId) {
        const configNode = machineData.nodes.find(n =>
            n.name === 'config' || n.name === 'llmConfig' || n.name === 'modelConfig'
        );
        if (configNode?.attributes) {
            const modelAttr = configNode.attributes.find(a => a.name === 'modelId' || a.name === 'model');
            if (modelAttr?.value) {
                machineModelId = String(modelAttr.value).replace(/^["']|["']$/g, '');
            }
        }
    }

    // Model ID priority: CLI param > Machine config > Environment var > Default
    const modelId = opts.model || machineModelId || process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-haiku-20241022';

    if (opts.verbose) {
        logger.debug(`Model ID: ${modelId} (source: ${opts.model ? 'CLI' : machineModelId ? 'machine config' : process.env.ANTHROPIC_MODEL_ID ? 'env' : 'default'})`);
    }

    // Configure LLM client to use Anthropic with API key from environment
    const config = {
        llm: {
            provider: 'anthropic' as const,
            apiKey: process.env.ANTHROPIC_API_KEY,
            modelId: modelId
        },
        agentSDK: {
            model: 'sonnet' as const,
            modelId: modelId, // Pass computed modelId to Agent SDK
            apiKey: process.env.ANTHROPIC_API_KEY,
            maxTurns: 50,
            persistHistory: true,
            historyPath: opts.destination ? path.join(opts.destination, 'execution-history.json') : './execution-history.json'
        }
    };

    // Check if API key is available
    if (!process.env.ANTHROPIC_API_KEY) {
        logger.warn('\n⚠️  Warning: ANTHROPIC_API_KEY environment variable not set.');
        logger.info(chalk.gray('   Set it with: export ANTHROPIC_API_KEY=your_api_key_here'));
        logger.info(chalk.gray('   Note: Execution will use placeholder agent responses (Agent SDK integration pending).\n'));
    }

    logger.debug('Starting execution...');

    // Execute the machine with Rails-Based Architecture
    const executor = await RailsExecutor.create(machineData, config);

    // Set up callback to save updated machine definition when agent modifies it
    let machineWasUpdated = false;
    executor.setMachineUpdateCallback(async (dsl: string) => {
        machineWasUpdated = true;
        const data = extractDestinationAndName(fileName, opts.destination);

        // Save updated DSL to a new file with suffix
        const updatedFileName = `${data.name}-updated.machine`;
        const updatedPath = path.join(data.destination, updatedFileName);

        await fs.writeFile(updatedPath, dsl, 'utf-8');
        console.log(chalk.magenta(`\n🔄 Machine definition updated by agent!`));
        console.log(chalk.gray(`   Updated DSL saved to: ${updatedPath}`));
    });

    const executionResult = await executor.execute();

    // Write execution results
    const data = extractDestinationAndName(fileName, opts.destination);
    // Ensure the destination directory exists
    await fs.mkdir(data.destination, { recursive: true });
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
    logger.success(`\n✓ Execution results written to: ${resultPath}`);
    logger.info(chalk.blue('\n📋 Execution path:'));
    executionResult.history.forEach(step => {
        logger.info(chalk.cyan(`  ${step.from}`) + chalk.gray(` --(${step.transition})--> `) + chalk.cyan(`${step.to}`));
        if (step.output) {
            logger.info(chalk.gray(`    Output: ${step.output}`));
        }
    });

    // Show mutations if machine was updated
    if (machineWasUpdated) {
        const mutations = executor.getMutations();
        const machineUpdateMutations = mutations.filter(m =>
            m.data?.mutationType === 'machine_updated'
        );

        if (machineUpdateMutations.length > 0) {
            console.log(chalk.magenta('\n🔧 Machine Mutations:'));
            machineUpdateMutations.forEach(mutation => {
                console.log(chalk.yellow(`  ${mutation.timestamp}`));
                console.log(chalk.gray(`    Reason: ${mutation.data.reason}`));
                if (mutation.data.machine) {
                    console.log(chalk.gray(`    Nodes: ${mutation.data.machine.nodeCount}, Edges: ${mutation.data.machine.edgeCount}`));
                }
            });
        }
    }
};

/**
 * Batch process multiple files
 * @param pattern Glob pattern for files to process
 * @param opts Batch options
 */
export const batchAction = async (pattern: string, opts: BatchOptions): Promise<void> => {
    setupLogger(opts);

    logger.info(`Searching for files matching pattern: ${pattern}`);

    // Find files matching the pattern
    const files = await glob(pattern, { nodir: true });

    if (files.length === 0) {
        logger.warn(`No files found matching pattern: ${pattern}`);
        return;
    }

    logger.info(`Found ${files.length} file(s) to process\n`);

    const results: { file: string; success: boolean; error?: string }[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each file
    for (const file of files) {
        try {
            logger.info(`Processing: ${file}`);

            // Call generateAction for each file
            await generateAction(file, {
                destination: opts.destination,
                format: opts.format,
                verbose: opts.verbose,
                quiet: opts.quiet
            });

            results.push({ file, success: true });
            successCount++;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            results.push({ file, success: false, error: errorMsg });
            errorCount++;

            logger.error(`Failed to process ${file}: ${errorMsg}`);

            if (!opts.continueOnError) {
                logger.error('Stopping batch processing due to error. Use --continue-on-error to continue processing remaining files.');
                break;
            }
        }
    }

    // Print summary
    logger.heading('\n✓ Batch Processing Complete');
    logger.success(`  Processed: ${successCount} file(s)`);
    if (errorCount > 0) {
        logger.error(`  Failed: ${errorCount} file(s)`);
    }

    if (opts.verbose) {
        logger.info('\nDetailed Results:');
        results.forEach(result => {
            if (result.success) {
                logger.success(`  ✓ ${result.file}`);
            } else {
                logger.error(`  ✗ ${result.file}: ${result.error}`);
            }
        });
    }
};

/**
 * Start local development server with API and playground
 * @param directory Working directory containing machine files
 * @param opts Server options
 */
export const serverAction = async (directory?: string, opts?: { port?: string; verbose?: boolean }): Promise<void> => {
    setupLogger(opts || {});

    // Resolve working directory
    const workingDir = directory ? path.resolve(process.cwd(), directory) : process.cwd();

    // Validate that the directory exists
    try {
        const stats = await fs.stat(workingDir);
        if (!stats.isDirectory()) {
            logger.error(`Path is not a directory: ${workingDir}`);
            process.exit(1);
        }
    } catch (error) {
        logger.error(`Directory not found: ${workingDir}`);
        process.exit(1);
    }

    const port = opts?.port || '5173';

    logger.info(chalk.blue('\n🚀 Starting DyGram Development Server...'));
    logger.info(chalk.gray(`   Working directory: ${workingDir}`));
    logger.info(chalk.gray(`   Port: ${port}`));

    // Set environment variables for the vite server
    process.env.DYGRAM_WORKING_DIR = workingDir;
    process.env.DYGRAM_LOCAL_MODE = 'true';

    // Find vite executable
    const viteExecutable = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'vite');
    const projectRoot = path.resolve(__dirname, '..', '..');

    logger.info(chalk.gray(`\n   Project root: ${projectRoot}`));
    logger.info(chalk.gray(`   Vite executable: ${viteExecutable}\n`));

    // Start vite dev server
    const viteArgs = ['--port', port, '--host'];
    const viteProcess = spawn(viteExecutable, viteArgs, {
        cwd: projectRoot,
        stdio: 'inherit',
        env: {
            ...process.env,
            DYGRAM_WORKING_DIR: workingDir,
            DYGRAM_LOCAL_MODE: 'true',
        },
    });

    viteProcess.on('error', (error) => {
        logger.error(chalk.red(`Failed to start server: ${error.message}`));
        process.exit(1);
    });

    viteProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            logger.error(chalk.red(`Server exited with code ${code}`));
            process.exit(code);
        }
    });

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        logger.info(chalk.yellow('\n\n⚡ Shutting down server...'));
        viteProcess.kill('SIGINT');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        viteProcess.kill('SIGTERM');
        process.exit(0);
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
                    .argument('<file>', `source file (DSL: ${fileExtensions}, or JSON for backward compilation)`)
                    .option('-d, --destination <dir>', 'destination directory for generated files')
                    .option('--debug', 'debug output raw ast', false)
                    .option('-f, --format <formats>',
                        'comma-separated list of output formats (json,graphviz,dot,html,dsl). Use "dsl" with JSON input for backward compilation. Default: json',
                        'json')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('generates output in specified formats\n\nExamples:\n  dygram generate file.dygram --format json,html\n  dygram generate file.json --format dsl  # backward compilation')
                    .action(generateAction);

                program
                    .command('batch')
                    .aliases(['b'])
                    .argument('<pattern>', 'glob pattern for files to process (e.g., "examples/**/*.dygram")')
                    .option('-d, --destination <dir>', 'destination directory for generated files')
                    .option('-f, --format <formats>',
                        'comma-separated list of output formats (json,graphviz,dot,html). Default: json',
                        'json')
                    .option('--continue-on-error', 'continue processing remaining files if an error occurs', false)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('batch process multiple files matching a glob pattern\n\nExamples:\n  dygram batch "examples/**/*.dygram" --format json\n  dygram batch "src/**/*.dygram" --format json,html --destination ./output')
                    .action(batchAction);

                program
                    .command('debug')
                    .aliases(['d'])
                    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
                    .option('-t, --text-regions', 'show positions of each syntax node', false)
                    .option('-s, --source-text', 'show the source text of each syntax node', false)
                    .option('-d, --destination <dir>', 'destination directory of generating')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('outputs serialised ast')
                    .action(generateSerialized);

                program.command('parseAndValidate')
                    .aliases(['pv'])
                    .argument('<file>', 'Source file to parse & validate (ending in ${fileExtensions})')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('Indicates where a program parses & validates successfully, but produces no output code')
                    .action(parseAndValidate);

                program
                    .command('execute')
                    .aliases(['exec', 'e'])
                    .argument('<file>', `source file (possible file extensions: ${fileExtensions})`)
                    .option('-d, --destination <dir>', 'destination directory for execution results')
                    .option('-m, --model <model>', 'model ID to use (e.g., claude-3-5-haiku-20241022, claude-3-5-sonnet-20241022)')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('executes a machine program')
                    .action(executeAction);

                program
                    .command('server')
                    .aliases(['serve', 's'])
                    .argument('[directory]', 'working directory containing machine files (defaults to current directory)')
                    .option('-p, --port <port>', 'port to run the server on', '5173')
                    .option('-v, --verbose', 'verbose output')
                    .description('starts local development server with API and playground\n\nExamples:\n  dygram server\n  dygram server ./my-machines\n  dygram server --port 3000')
                    .action(serverAction);

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
