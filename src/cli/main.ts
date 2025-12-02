import type { Machine } from '../language/generated/ast.js';
import chalk from 'chalk';
import { Command } from 'commander';
import { MachineLanguageMetaData } from '../language/generated/module.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode, extractDocument, extractDestinationAndName } from './cli-util.js';
import { MachineExecutor } from '../language/executor.js';
import type { MachineJSON } from '../language/json/types.js';
import { generateJSON, generateHTML, generateDSL, generateGraphviz, FileGenerationResult } from '../language/generator/generator.js';

// Type alias for backward compatibility
type MachineData = MachineJSON;
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { logger } from './logger.js';
import { glob } from 'glob';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { WorkspaceManager, FileSystemResolver, MultiFileGenerator } from '../language/import-system/index.js';
import { CircularDependencyError, ModuleNotFoundError } from '../language/import-system/import-errors.js';
import { executeInteractiveTurn } from './interactive-execution.js';
import { listExecutions, loadExecutionMetadata, removeExecution, cleanCompletedExecutions } from './execution-state.js';

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
    noImports?: boolean;
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

async function generateWithImports(fileName: string, opts: GenerateOptions, formats: GenerateFormat[]): Promise<void> {
    const services = createMachineServices(NodeFileSystem).Machine;
    const resolver = new FileSystemResolver();
    const workspace = new WorkspaceManager(services.shared.workspace.LangiumDocuments, resolver);

    try {
        const fileUri = pathToFileURL(path.resolve(fileName)).toString();

        // Link all imports
        logger.debug('Resolving imports...');
        await workspace.linkAll(fileUri);

        const fileCount = workspace.documents.size;
        logger.debug(`Loaded ${fileCount} file(s) (including imports)`);

        // Get entry document
        const entryDoc = workspace.documents.get(fileUri);
        if (!entryDoc) {
            logger.error(`Failed to load entry file: ${fileName}`);
            process.exit(1);
        }

        // Generate using multi-file generator
        const generator = new MultiFileGenerator();
        const mergedMachine = await generator.generate(entryDoc, workspace);

        const results: string[] = [];

        // Generate each requested format
        for (const format of formats) {
            try {
                let res: FileGenerationResult | undefined;
                switch (format) {
                    case 'json':
                        res = generateJSON(mergedMachine, fileName, opts.destination);
                        break;
                    case 'graphviz':
                    case 'dot':
                        res = generateGraphviz(mergedMachine, fileName, opts.destination);
                        break;
                    case 'html':
                        res = generateHTML(mergedMachine, fileName, opts.destination);
                        break;
                    default:
                        logger.warn(`Format '${format}' is not supported for multi-file input`);
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

        if (opts.destination && results.length > 0) {
            logger.heading('\n✓ Generation Complete');
            results.forEach(result => logger.success('  ' + result));

            if (formats.includes('html')) {
                logger.tip('\n💡 Tip: Open the HTML file in a browser to view the interactive diagram');
            }
        }

    } catch (error) {
        if (error instanceof CircularDependencyError) {
            logger.error('✗ Circular dependency detected:');
            logger.error('  ' + error.cycle.map(uri => fileURLToPath(uri)).join(' → '));
            process.exit(1);
        } else if (error instanceof ModuleNotFoundError) {
            logger.error(`✗ ${error.message}`);
            process.exit(1);
        } else {
            throw error;
        }
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

    // Check if file has imports and --no-imports is not set
    const document = await extractDocument(fileName, services);
    const machine = document.parseResult.value as Machine;

    const hasImports = machine.imports && machine.imports.length > 0;
    const useImportSystem = hasImports && !opts.noImports;

    if (useImportSystem) {
        logger.debug('File has imports, using multi-file compilation');
        await generateWithImports(fileName, opts, formats);
        return;
    }

    // Standard single-file DSL input processing
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
                    const outputPath = path.join(data.destination, `${data.name}.dy`);
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
 * Read stdin if available (with timeout)
 */
async function readStdin(): Promise<string> {
    return new Promise((resolve) => {
        let data = '';
        let resolved = false;

        const cleanup = () => {
            process.stdin.removeAllListeners('data');
            process.stdin.removeAllListeners('end');
            process.stdin.removeAllListeners('error');
            process.stdin.pause();
        };

        const finish = (result: string) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                cleanup();
                resolve(result);
            }
        };

        const timeout = setTimeout(() => {
            finish(''); // Return empty string on timeout
        }, 100); // 100ms timeout

        const onData = (chunk: Buffer) => {
            data += chunk.toString();
        };

        const onEnd = () => {
            finish(data);
        };

        const onError = () => {
            finish(''); // Return empty on error
        };

        process.stdin.on('data', onData);
        process.stdin.on('end', onEnd);
        process.stdin.on('error', onError);

        // Resume stdin to start reading
        process.stdin.resume();
    });
}

/**
 * Execute a machine program
 * @param fileName Program to execute
 * @param opts Execution options
 */
export const executeAction = async (fileName: string | undefined, opts: {
    destination?: string;
    model?: string;
    verbose?: boolean;
    quiet?: boolean;
    noImports?: boolean;
    interactive?: boolean;
    id?: string;
    force?: boolean;
    playback?: string;
    record?: string;
}): Promise<void> => {
    setupLogger(opts);

    // Handle interactive mode
    if (opts.interactive) {
        // Determine machine source and input data
        let machineSource: string | undefined = fileName;
        let inputData: any = undefined;

        // Only read stdin if data is being piped in (not a TTY)
        if (!process.stdin.isTTY) {
            const stdin = await readStdin();

            // Only process if stdin has content
            if (stdin && stdin.trim()) {
                if (!fileName) {
                    // No file argument: stdin is machine source
                    machineSource = stdin;
                } else {
                    // File argument provided: stdin is input/response data
                    try {
                        inputData = JSON.parse(stdin);
                    } catch (e) {
                        logger.error('Invalid JSON input from stdin');
                        process.exit(1);
                    }
                }
            }
        }

        if (!machineSource) {
            logger.error('No machine source provided (file or stdin)');
            process.exit(1);
        }

        await executeInteractiveTurn(machineSource, {
            id: opts.id,
            playback: opts.playback,
            record: opts.record,
            force: opts.force,
            verbose: opts.verbose,
            input: inputData,
            isStdin: !fileName,
            interactive: opts.interactive
        });

        return;
    }

    // Non-interactive mode (original implementation)
    if (!fileName) {
        logger.error('File argument required for non-interactive execution');
        process.exit(1);
    }

    // retrieve the services for our language
    const services = createMachineServices(NodeFileSystem).Machine;

    // Check if file has imports
    const document = await extractDocument(fileName, services);
    const machine = document.parseResult.value as Machine;
    const hasImports = machine.imports && machine.imports.length > 0;
    const useImportSystem = hasImports && !opts.noImports;

    let machineData: MachineData;

    if (useImportSystem) {
        logger.debug('File has imports, using multi-file compilation');

        const resolver = new FileSystemResolver();
        const workspace = new WorkspaceManager(services.shared.workspace.LangiumDocuments, resolver);

        try {
            const fileUri = pathToFileURL(path.resolve(fileName)).toString();

            // Link all imports
            await workspace.linkAll(fileUri);

            const entryDoc = workspace.documents.get(fileUri);
            if (!entryDoc) {
                logger.error(`Failed to load entry file: ${fileName}`);
                process.exit(1);
            }

            // Generate using multi-file generator
            const generator = new MultiFileGenerator();
            const mergedMachine = await generator.generate(entryDoc, workspace);

            // Generate JSON representation for execution
            const jsonContent = generateJSON(mergedMachine, fileName, opts.destination);
            machineData = JSON.parse(jsonContent.content) as MachineData;

        } catch (error) {
            if (error instanceof CircularDependencyError) {
                logger.error('✗ Circular dependency detected:');
                logger.error('  ' + error.cycle.map(uri => fileURLToPath(uri)).join(' → '));
                process.exit(1);
            } else if (error instanceof ModuleNotFoundError) {
                logger.error(`✗ ${error.message}`);
                process.exit(1);
            } else {
                throw error;
            }
        }
    } else {
        // Single-file execution (existing code)
        const singleMachine = await extractAstNode<Machine>(fileName, services);
        const jsonContent = generateJSON(singleMachine, fileName, opts.destination);
        machineData = JSON.parse(jsonContent.content) as MachineData;
    }

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
    const executor = await MachineExecutor.create(machineData, config);

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

    await executor.execute();

    // Get execution context for results
    const context = executor.getContext();

    // Write execution results
    const data = extractDestinationAndName(fileName, opts.destination);
    // Ensure the destination directory exists
    await fs.mkdir(data.destination, { recursive: true });
    const resultPath = path.join(data.destination, `${data.name}-result.json`);
    await fs.writeFile(resultPath, JSON.stringify(
        {
            currentNode: context.currentNode,
            visitedNodes: Array.from(context.visitedNodes),
            attributes: Object.fromEntries(context.attributes),
            history: context.history,
            errorCount: context.errorCount
        },
        null,
        2
    ));
    logger.success(`\n✓ Execution results written to: ${resultPath}`);
    logger.info(chalk.blue('\n📋 Execution path:'));
    context.history.forEach((step: any) => {
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
 * Check imports and show dependency graph
 * @param fileName Entry file to check
 * @param opts Options
 */
export const checkImportsAction = async (fileName: string, opts?: { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts || {});

    const services = createMachineServices(NodeFileSystem).Machine;
    const resolver = new FileSystemResolver();
    const workspace = new WorkspaceManager(services.shared.workspace.LangiumDocuments, resolver);

    try {
        const fileUri = pathToFileURL(path.resolve(fileName)).toString();

        logger.info(`Checking imports for: ${fileName}`);

        // Link all imports
        await workspace.linkAll(fileUri);

        logger.success('\n✓ All imports resolved successfully\n');

        // Show dependency graph
        logger.heading('Dependency Graph:');
        const graph = workspace.dependencyGraph;
        const order = graph.topologicalSort();

        if (order) {
            order.forEach((uri, i) => {
                const filePath = fileURLToPath(uri.toString());
                const relativePath = path.relative(process.cwd(), filePath);
                logger.info(`  ${i + 1}. ${relativePath}`);
            });

            logger.info(`\nTotal files: ${order.length}`);
        }

    } catch (error) {
        if (error instanceof CircularDependencyError) {
            logger.error('\n✗ Circular dependency detected:');
            logger.error('  ' + error.cycle.map(uri => path.relative(process.cwd(), fileURLToPath(uri))).join(' → '));
            process.exit(1);
        } else if (error instanceof ModuleNotFoundError) {
            logger.error(`\n✗ ${error.message}`);
            process.exit(1);
        } else {
            throw error;
        }
    }
};

/**
 * Bundle multi-file machine into single file
 * @param fileName Entry file to bundle
 * @param opts Bundling options
 */
export const bundleAction = async (fileName: string, opts: { output?: string; verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const resolver = new FileSystemResolver();
    const workspace = new WorkspaceManager(services.shared.workspace.LangiumDocuments, resolver);

    try {
        const fileUri = pathToFileURL(path.resolve(fileName)).toString();

        logger.info(`Bundling: ${fileName}`);

        // Link all imports
        await workspace.linkAll(fileUri);

        const entryDoc = workspace.documents.get(fileUri);
        if (!entryDoc) {
            logger.error(`Failed to load entry file: ${fileName}`);
            process.exit(1);
        }

        // Generate using multi-file generator
        const generator = new MultiFileGenerator();
        const mergedMachine = await generator.generate(entryDoc, workspace);

        // Generate JSON representation
        const jsonContent = generateJSON(mergedMachine, fileName);
        const machineData = JSON.parse(jsonContent.content) as MachineData;

        // Reverse-compile to DSL
        const bundledDsl = generateDSL(machineData);

        // Write to output file
        const outputFile = opts.output || fileName.replace(/\.dy/, '.bundled.dy');
        await fs.writeFile(outputFile, bundledDsl);

        logger.success(`\n✓ Bundled to: ${outputFile}`);
        logger.info(`   Merged ${workspace.documents.size} file(s)`);

    } catch (error) {
        if (error instanceof CircularDependencyError) {
            logger.error('\n✗ Circular dependency detected:');
            logger.error('  ' + error.cycle.map(uri => fileURLToPath(uri)).join(' → '));
            process.exit(1);
        } else if (error instanceof ModuleNotFoundError) {
            logger.error(`\n✗ ${error.message}`);
            process.exit(1);
        } else {
            throw error;
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

/**
 * List all executions
 */
export const listExecutionsAction = async (opts?: { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts || {});

    const executions = await listExecutions();

    if (executions.length === 0) {
        logger.info('No executions found');
        return;
    }

    logger.heading('Active executions:');
    for (const exec of executions) {
        const ago = timeAgo(new Date(exec.lastExecutedAt));
        const machineSource = exec.machineFile || '(stdin)';
        const status = exec.status === 'complete' ? chalk.green(exec.status) :
                      exec.status === 'error' ? chalk.red(exec.status) :
                      chalk.yellow(exec.status);

        logger.info(`  ${chalk.bold(exec.id)}`);
        logger.info(`    Machine: ${machineSource}`);
        logger.info(`    Status: ${status}`);
        logger.info(`    Turns: ${exec.turnCount}`);
        logger.info(`    Last updated: ${ago}`);

        if (opts?.verbose) {
            logger.info(`    Mode: ${exec.mode}`);
            if (exec.clientConfig) {
                logger.info(`    Client: ${exec.clientConfig.type}`);
            }
        }
    }
}

/**
 * Show execution status
 */
export const showExecutionStatusAction = async (
    id: string,
    opts?: { verbose?: boolean; quiet?: boolean }
): Promise<void> => {
    setupLogger(opts || {});

    try {
        const metadata = await loadExecutionMetadata(id);

        logger.heading(`Execution: ${chalk.bold(id)}`);
        logger.info(`  Machine: ${metadata.machineFile || '(stdin)'}`);
        logger.info(`  Status: ${metadata.status}`);
        logger.info(`  Mode: ${metadata.mode}`);
        logger.info(`  Turns: ${metadata.turnCount}`);
        logger.info(`  Steps: ${metadata.stepCount}`);
        logger.info(`  Started: ${new Date(metadata.startedAt).toLocaleString()}`);
        logger.info(`  Last updated: ${new Date(metadata.lastExecutedAt).toLocaleString()}`);

        if (metadata.clientConfig) {
            logger.info(`\n  Client Config:`);
            logger.info(`    Type: ${metadata.clientConfig.type}`);
            if (metadata.clientConfig.playbackDir) {
                logger.info(`    Playback: ${metadata.clientConfig.playbackDir}`);
            }
            if (metadata.clientConfig.recordingsDir) {
                logger.info(`    Recordings: ${metadata.clientConfig.recordingsDir}`);
            }
        }
    } catch (error) {
        logger.error(`Execution not found: ${id}`);
        process.exit(1);
    }
}

/**
 * Remove execution
 */
export const removeExecutionAction = async (
    id: string,
    opts?: { verbose?: boolean; quiet?: boolean }
): Promise<void> => {
    setupLogger(opts || {});

    try {
        await removeExecution(id);
        logger.success(`Removed execution: ${id}`);
    } catch (error) {
        logger.error(`Failed to remove execution: ${id}`);
        process.exit(1);
    }
}

/**
 * Clean completed executions
 */
export const cleanExecutionsAction = async (opts?: {
    all?: boolean;
    verbose?: boolean;
    quiet?: boolean;
}): Promise<void> => {
    setupLogger(opts || {});

    const result = await cleanCompletedExecutions({ all: opts?.all });

    if (result.cleaned === 0) {
        logger.info('No executions to clean');
    } else {
        logger.success(`Cleaned ${result.cleaned} execution(s)`);
    }

    // Show remaining executions when --all was not provided
    if (!opts?.all && (result.pending > 0 || result.error > 0)) {
        const remaining: string[] = [];
        if (result.pending > 0) {
            remaining.push(`${result.pending} in progress/paused`);
        }
        if (result.error > 0) {
            remaining.push(`${result.error} with errors`);
        }
        logger.info(`Remaining: ${remaining.join(', ')}. use --all to force.`);
    }

    // Show failed removals if any
    if (result.failed > 0) {
        logger.warn(`Failed to remove: ${result.failed} execution(s)`);
    }
}

/**
 * Format time ago
 */
function timeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds} seconds ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
}

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
                    .option('--no-imports', 'disable import resolution (treat as single file)', false)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('generates output in specified formats\n\nExamples:\n  dygram generate file.dy--format json,html\n  dygram generate file.json --format dsl  # backward compilation')
                    .action(generateAction);

                program
                    .command('batch')
                    .aliases(['b'])
                    .argument('<pattern>', 'glob pattern for files to process (e.g., "examples/**/*.dy")')
                    .option('-d, --destination <dir>', 'destination directory for generated files')
                    .option('-f, --format <formats>',
                        'comma-separated list of output formats (json,graphviz,dot,html). Default: json',
                        'json')
                    .option('--continue-on-error', 'continue processing remaining files if an error occurs', false)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('batch process multiple files matching a glob pattern\n\nExamples:\n  dygram batch "examples/**/*.dy --format json\n  dygram batch "src/**/*.dy --format json,html --destination ./output')
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
                    .aliases(['e'])
                    .argument('[file]', `source file (${fileExtensions}) or stdin if omitted`)
                    .option('-i, --interactive', 'interactive turn-by-turn execution')
                    .option('--id <id>', 'execution ID (for managing multiple executions)')
                    .option('--force', 'force new execution (ignore existing state)')
                    .option('--playback <dir>', 'playback from recordings directory')
                    .option('--record <dir>', 'record execution to directory')
                    .option('-d, --destination <dir>', 'destination directory for execution results')
                    .option('-m, --model <model>', 'model ID to use (e.g., claude-3-5-haiku-20241022, claude-3-5-sonnet-20241022)')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .option('--no-imports', 'disable import resolution (treat as single file)')
                    .description('executes a machine program\n\nExamples:\n  dygram execute app.dy\n  dygram execute app.dy --interactive\n  cat app.dy| dygram execute --interactive\n  dygram execute app.dy--playback recordings/\n  echo \'{"input": "..."}\' | dygram e -i app.dy')
                    .action(executeAction);

                program
                    .command('check-imports')
                    .aliases(['ci'])
                    .argument('<file>', `source file to check (${fileExtensions})`)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('validate imports and show dependency graph\n\nExamples:\n  dygram check-imports app.dy')
                    .action(checkImportsAction);

                program
                    .command('bundle')
                    .argument('<file>', `entry file to bundle (${fileExtensions})`)
                    .option('-o, --output <file>', 'output file path')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('bundle multi-file machine into single file\n\nExamples:\n  dygram bundle app.dyn  dygram bundle app.dy--output dist/app.bundled.dy')
                    .action(bundleAction);

                program
                    .command('server')
                    .aliases(['serve', 's'])
                    .argument('[directory]', 'working directory containing machine files (defaults to current directory)')
                    .option('-p, --port <port>', 'port to run the server on', '5173')
                    .option('-v, --verbose', 'verbose output')
                    .description('starts local development server with API and playground\n\nExamples:\n  dygram server\n  dygram server ./my-machines\n  dygram server --port 3000')
                    .action(serverAction);

                // Execution management commands
                const execCmd = program
                    .command('exec')
                    .description('manage interactive executions');

                execCmd
                    .command('list')
                    .aliases(['ls'])
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('list all executions\n\nExamples:\n  dygram exec list\n  dygram exec ls -v')
                    .action(listExecutionsAction);

                execCmd
                    .command('status')
                    .argument('<id>', 'execution ID')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('show execution status\n\nExamples:\n  dygram exec status exec-20251201-143022')
                    .action(showExecutionStatusAction);

                execCmd
                    .command('rm')
                    .argument('<id>', 'execution ID')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('remove execution\n\nExamples:\n  dygram exec rm exec-20251201-143022')
                    .action(removeExecutionAction);

                execCmd
                    .command('clean')
                    .option('--all', 'clean all executions including incomplete')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('clean up completed executions\n\nExamples:\n  dygram exec clean\n  dygram exec clean --all')
                    .action(cleanExecutionsAction);

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
