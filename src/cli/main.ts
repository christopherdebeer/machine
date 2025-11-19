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
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { WorkspaceManager, FileSystemResolver, MultiFileGenerator } from '../language/import-system/index.js';
import { CircularDependencyError, ModuleNotFoundError } from '../language/import-system/import-errors.js';
import { CodeGenerator, resolveCodePath, hasGeneratedCode, loadGeneratedCode } from '../language/code-generation.js';
import { CodeExecutor } from '../language/code-executor.js';
import { ClaudeClient } from '../language/llm-client.js';

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
    const workingDir = path.dirname(path.resolve(fileName));
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
    const fileUri = pathToFileURL(path.resolve(fileName)).toString();
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
export const executeAction = async (fileName: string, opts: { destination?: string; model?: string; verbose?: boolean; quiet?: boolean; noImports?: boolean }): Promise<void> => {
    setupLogger(opts);

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

        const workingDir = path.dirname(path.resolve(fileName));
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
        },
        dygramFilePath: path.resolve(fileName) // For code generation support
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
 * Check imports and show dependency graph
 * @param fileName Entry file to check
 * @param opts Options
 */
export const checkImportsAction = async (fileName: string, opts?: { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts || {});

    const services = createMachineServices(NodeFileSystem).Machine;
    const workingDir = path.dirname(path.resolve(fileName));
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

        order.forEach((uri, i) => {
            const filePath = fileURLToPath(uri);
            const relativePath = path.relative(process.cwd(), filePath);
            logger.info(`  ${i + 1}. ${relativePath}`);
        });

        logger.info(`\nTotal files: ${order.length}`);

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
    const workingDir = path.dirname(path.resolve(fileName));
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
        const outputFile = opts.output || fileName.replace(/\.dygram$/, '.bundled.dygram');
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

// ============================================================================
// Code Generation CLI Commands
// ============================================================================

/**
 * Show code generation status for all tasks in a machine
 */
export const codeStatusAction = async (fileName: string, opts: { verbose?: boolean; quiet?: boolean }): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const document = await extractDocument(fileName, services);
    const machine = extractAstNode<Machine>(fileName, services, document);

    const dygramFilePath = path.resolve(fileName);

    console.log(chalk.bold(`\n📊 Code Generation Status: ${path.basename(fileName)}\n`));

    const tasks = machine.elements.filter(el => el.$type === 'TaskNode');

    if (tasks.length === 0) {
        console.log(chalk.gray('  No tasks found in machine.'));
        return;
    }

    const codeExecutor = new CodeExecutor(new ClaudeClient({
        apiKey: process.env.ANTHROPIC_API_KEY || 'dummy',
        modelId: 'claude-3-5-haiku-20241022'
    }));

    for (const task of tasks) {
        const hasCode = codeExecutor.hasCodeAnnotation(task as any);
        const codeRef = codeExecutor.getCodeReference(task as any);

        if (hasCode && codeRef) {
            const codePath = resolveCodePath(codeRef, dygramFilePath);
            const exists = await hasGeneratedCode(codeRef, dygramFilePath);

            if (exists) {
                console.log(chalk.green(`  ✓ ${task.name}`) + chalk.gray(` → ${path.basename(codePath)}`));
            } else {
                console.log(chalk.yellow(`  ⚠ ${task.name}`) + chalk.gray(` → ${path.basename(codePath)} (not generated yet)`));
            }
        } else {
            console.log(chalk.gray(`  ○ ${task.name} (no @code annotation)`));
        }
    }

    console.log();
};

/**
 * Manually generate code for a specific task
 */
export const generateCodeAction = async (
    fileName: string,
    taskName: string,
    opts: { model?: string; verbose?: boolean; quiet?: boolean }
): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const document = await extractDocument(fileName, services);
    const machine = extractAstNode<Machine>(fileName, services, document);

    const dygramFilePath = path.resolve(fileName);
    const task = machine.elements.find(el => el.$type === 'TaskNode' && el.name === taskName);

    if (!task) {
        logger.error(`Task "${taskName}" not found in ${fileName}`);
        process.exit(1);
    }

    const modelId = opts.model || process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-sonnet-20241022';
    const llmClient = new ClaudeClient({
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelId: modelId
    });

    if (!process.env.ANTHROPIC_API_KEY) {
        logger.error('ANTHROPIC_API_KEY environment variable not set');
        process.exit(1);
    }

    const codeExecutor = new CodeExecutor(llmClient);
    const codeRef = codeExecutor.getCodeReference(task as any);

    if (!codeRef) {
        logger.error(`Task "${taskName}" does not have a code reference (@code annotation required)`);
        process.exit(1);
    }

    console.log(chalk.bold(`\n⚡ Generating code for task: ${taskName}\n`));

    const codeGenerator = new CodeGenerator(llmClient);
    const schema = codeExecutor.getTaskSchema(task as any);

    try {
        const result = await codeGenerator.generateCode({
            taskName: task.name,
            prompt: (task as any).attributes?.find((a: any) => a.name === 'prompt')?.value || task.name,
            schema: schema,
            externalRef: codeRef,
            dygramFilePath: dygramFilePath
        });

        const codePath = resolveCodePath(codeRef, dygramFilePath);
        console.log(chalk.green(`✓ Code generated successfully!`));
        console.log(chalk.gray(`  Path: ${codePath}`));
        console.log(chalk.gray(`  Lines: ${result.code.split('\n').length}`));
        console.log();
    } catch (error) {
        logger.error(`Failed to generate code: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
};

/**
 * Force regeneration of code for a task
 */
export const regenerateCodeAction = async (
    fileName: string,
    taskName: string,
    opts: { reason?: string; model?: string; verbose?: boolean; quiet?: boolean }
): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const document = await extractDocument(fileName, services);
    const machine = extractAstNode<Machine>(fileName, services, document);

    const dygramFilePath = path.resolve(fileName);
    const task = machine.elements.find(el => el.$type === 'TaskNode' && el.name === taskName);

    if (!task) {
        logger.error(`Task "${taskName}" not found in ${fileName}`);
        process.exit(1);
    }

    const modelId = opts.model || process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-sonnet-20241022';
    const llmClient = new ClaudeClient({
        apiKey: process.env.ANTHROPIC_API_KEY,
        modelId: modelId
    });

    if (!process.env.ANTHROPIC_API_KEY) {
        logger.error('ANTHROPIC_API_KEY environment variable not set');
        process.exit(1);
    }

    const codeExecutor = new CodeExecutor(llmClient);
    const codeRef = codeExecutor.getCodeReference(task as any);

    if (!codeRef) {
        logger.error(`Task "${taskName}" does not have a code reference (@code annotation required)`);
        process.exit(1);
    }

    console.log(chalk.bold(`\n🔄 Regenerating code for task: ${taskName}\n`));
    if (opts.reason) {
        console.log(chalk.gray(`  Reason: ${opts.reason}\n`));
    }

    const codeGenerator = new CodeGenerator(llmClient);
    const schema = codeExecutor.getTaskSchema(task as any);

    try {
        // Load existing code to show in regeneration context
        const existingCode = await hasGeneratedCode(codeRef, dygramFilePath)
            ? await loadGeneratedCode(codeRef, dygramFilePath)
            : undefined;

        const result = await codeGenerator.regenerateCode({
            taskName: task.name,
            prompt: (task as any).attributes?.find((a: any) => a.name === 'prompt')?.value || task.name,
            schema: schema,
            externalRef: codeRef,
            dygramFilePath: dygramFilePath,
            previousCode: existingCode,
            error: opts.reason ? new Error(opts.reason) : undefined
        });

        const codePath = resolveCodePath(codeRef, dygramFilePath);
        console.log(chalk.green(`✓ Code regenerated successfully!`));
        console.log(chalk.gray(`  Path: ${codePath}`));
        console.log(chalk.gray(`  Lines: ${result.code.split('\n').length}`));
        console.log();
    } catch (error) {
        logger.error(`Failed to regenerate code: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
    }
};

/**
 * Display generated code for a task
 */
export const showCodeAction = async (
    fileName: string,
    taskName: string,
    opts: { verbose?: boolean; quiet?: boolean }
): Promise<void> => {
    setupLogger(opts);

    const services = createMachineServices(NodeFileSystem).Machine;
    const document = await extractDocument(fileName, services);
    const machine = extractAstNode<Machine>(fileName, services, document);

    const dygramFilePath = path.resolve(fileName);
    const task = machine.elements.find(el => el.$type === 'TaskNode' && el.name === taskName);

    if (!task) {
        logger.error(`Task "${taskName}" not found in ${fileName}`);
        process.exit(1);
    }

    const llmClient = new ClaudeClient({
        apiKey: 'dummy',
        modelId: 'claude-3-5-haiku-20241022'
    });

    const codeExecutor = new CodeExecutor(llmClient);
    const codeRef = codeExecutor.getCodeReference(task as any);

    if (!codeRef) {
        logger.error(`Task "${taskName}" does not have a code reference (@code annotation required)`);
        process.exit(1);
    }

    const exists = await hasGeneratedCode(codeRef, dygramFilePath);

    if (!exists) {
        const codePath = resolveCodePath(codeRef, dygramFilePath);
        logger.error(`No generated code found at: ${codePath}`);
        console.log(chalk.gray('\nRun this command to generate code:'));
        console.log(chalk.cyan(`  dygram generate-code ${fileName} ${taskName}`));
        process.exit(1);
    }

    const code = await loadGeneratedCode(codeRef, dygramFilePath);
    const codePath = resolveCodePath(codeRef, dygramFilePath);

    console.log(chalk.bold(`\n📄 Generated code for task: ${taskName}`));
    console.log(chalk.gray(`   Path: ${codePath}\n`));
    console.log(chalk.gray('─'.repeat(80)));
    console.log(code);
    console.log(chalk.gray('─'.repeat(80)));
    console.log();
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
                    .option('--no-imports', 'disable import resolution (treat as single file)', false)
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
                    .command('check-imports')
                    .aliases(['ci'])
                    .argument('<file>', `source file to check (${fileExtensions})`)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('validate imports and show dependency graph\n\nExamples:\n  dygram check-imports app.dygram')
                    .action(checkImportsAction);

                program
                    .command('bundle')
                    .argument('<file>', `entry file to bundle (${fileExtensions})`)
                    .option('-o, --output <file>', 'output file path')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('bundle multi-file machine into single file\n\nExamples:\n  dygram bundle app.dygram\n  dygram bundle app.dygram --output dist/app.bundled.dygram')
                    .action(bundleAction);

                program
                    .command('server')
                    .aliases(['serve', 's'])
                    .argument('[directory]', 'working directory containing machine files (defaults to current directory)')
                    .option('-p, --port <port>', 'port to run the server on', '5173')
                    .option('-v, --verbose', 'verbose output')
                    .description('starts local development server with API and playground\n\nExamples:\n  dygram server\n  dygram server ./my-machines\n  dygram server --port 3000')
                    .action(serverAction);

                program
                    .command('code-status')
                    .aliases(['cs'])
                    .argument('<file>', `machine file to check (${fileExtensions})`)
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('show code generation status for all tasks\n\nExamples:\n  dygram code-status app.dygram')
                    .action(codeStatusAction);

                program
                    .command('generate-code')
                    .aliases(['gc'])
                    .argument('<file>', `machine file (${fileExtensions})`)
                    .argument('<task>', 'task name to generate code for')
                    .option('-m, --model <model>', 'model ID to use for code generation')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('manually generate code for a specific task\n\nExamples:\n  dygram generate-code app.dygram ValidateEmail\n  dygram gc app.dygram ProcessData --model claude-3-5-sonnet-20241022')
                    .action(generateCodeAction);

                program
                    .command('regenerate')
                    .aliases(['regen'])
                    .argument('<file>', `machine file (${fileExtensions})`)
                    .argument('<task>', 'task name to regenerate code for')
                    .option('-r, --reason <reason>', 'reason for regeneration (helps LLM understand what to fix)')
                    .option('-m, --model <model>', 'model ID to use for code generation')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('force regeneration of code for a task\n\nExamples:\n  dygram regenerate app.dygram ValidateEmail\n  dygram regen app.dygram ProcessData --reason "Fix type error in output"')
                    .action(regenerateCodeAction);

                program
                    .command('show-code')
                    .aliases(['sc'])
                    .argument('<file>', `machine file (${fileExtensions})`)
                    .argument('<task>', 'task name to show code for')
                    .option('-v, --verbose', 'verbose output')
                    .option('-q, --quiet', 'quiet output (errors only)')
                    .description('display generated code for a task\n\nExamples:\n  dygram show-code app.dygram ValidateEmail\n  dygram sc app.dygram ProcessData')
                    .action(showCodeAction);

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
