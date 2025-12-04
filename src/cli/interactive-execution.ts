/**
 * Interactive Execution Orchestration for CLI
 *
 * Handles turn-by-turn execution with persistent state across CLI calls.
 */

import chalk from 'chalk';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { MachineExecutor } from '../language/executor.js';
import type { MachineJSON } from '../language/json/types.js';
import type { Machine } from '../language/generated/ast.js';
import { createMachineServices } from '../language/machine-module.js';
import { extractAstNode } from './cli-util.js';
import { NodeFileSystem } from 'langium/node';
import { generateJSON } from '../language/generator/generator.js';
import { PlaybackTestClient } from '../language/playback-test-client.js';
import { InteractiveTestClient } from '../language/interactive-test-client.js';
import { StdinResponseClient, PendingResponseError } from '../language/stdin-response-client.js';
import { logger } from './logger.js';
import { RuntimeVisualizer, formatRuntimeSnapshot, formatRuntimeSnapshotJSON, formatRuntimeSnapshotCompact } from '../language/runtime-visualizer.js';

// Re-export visualization utilities
export { RuntimeVisualizer, formatRuntimeSnapshot, formatRuntimeSnapshotJSON, formatRuntimeSnapshotCompact };
import {
    type LoadExecutionOptions,
    type ExecutionMetadata,
    type ExecutionStateFile,
    type TurnHistoryEntry,
    generateExecutionId,
    hashMachine,
    getLastExecutionId,
    updateLastSymlink,
    executionExists,
    loadExecutionState,
    saveExecutionState,
    loadExecutionMetadata,
    saveExecutionMetadata,
    saveMachineSnapshot,
    loadMachineSnapshot,
    appendTurnHistory,
    STATE_CONFIG
} from './execution-state.js';

/**
 * Result of loading or creating an execution
 */
export interface LoadedExecution {
    executor: MachineExecutor;
    metadata: ExecutionMetadata;
    isNew: boolean;
}

/**
 * Parse machine from DSL source string
 */
async function parseMachineFromSource(source: string): Promise<MachineJSON> {
    // Write source to temp file
    const tempFile = path.join(os.tmpdir(), `dygram-stdin-${Date.now()}.dy`);
    await fs.writeFile(tempFile, source);

    try {
        // Parse using existing infrastructure
        const services = createMachineServices(NodeFileSystem).Machine;
        const model = await extractAstNode<Machine>(tempFile, services);
        const jsonContent = generateJSON(model, tempFile);
        return JSON.parse(jsonContent.content) as MachineJSON;
    } finally {
        // Clean up temp file
        await fs.unlink(tempFile).catch(() => {});
    }
}

/**
 * Load machine from file
 */
async function loadMachineFromFile(filePath: string): Promise<MachineJSON> {
    const services = createMachineServices(NodeFileSystem).Machine;
    const model = await extractAstNode<Machine>(filePath, services);
    const jsonContent = generateJSON(model, filePath);
    return JSON.parse(jsonContent.content) as MachineJSON;
}

/**
 * Configure LLM client based on options
 */
function configureClient(opts: LoadExecutionOptions): any {
    // Interactive mode with stdin/stdout (with or without recording)
    if (opts.isInteractive && !opts.playback) {
        return {
            llm: new StdinResponseClient({
                modelId: 'cli-interactive',
                responseInput: opts.input ? JSON.stringify(opts.input) : undefined,
                recordingsDir: opts.record  // Enable recording if --record is set
            })
        };
    }

    if (opts.playback) {
        return {
            llm: new PlaybackTestClient({
                recordingsDir: opts.playback,
                simulateDelay: true,
                delay: 100,
                strict: true,
                matchingMode: 'hybrid'
            })
        };
    }

    // Default: use API client
    const modelId = process.env.ANTHROPIC_MODEL_ID || 'claude-3-5-haiku-20241022';
    return {
        llm: {
            provider: 'anthropic' as const,
            apiKey: process.env.ANTHROPIC_API_KEY,
            modelId
        },
        agentSDK: {
            model: 'sonnet' as const,
            modelId,
            apiKey: process.env.ANTHROPIC_API_KEY,
            maxTurns: 50,
            persistHistory: true
        }
    };
}

/**
 * Load or create execution
 */
export async function loadOrCreateExecution(
    opts: LoadExecutionOptions
): Promise<LoadedExecution> {
    // Resolve execution ID
    let executionId = opts.executionId;
    let isNew = false;

    if (!executionId && !opts.force) {
        // Try to use "last" execution
        const lastId = await getLastExecutionId();
        if (lastId) {
            executionId = lastId;
            logger.info(chalk.blue(`⚡ Resuming execution: ${executionId}`));
        }
    }

    if (!executionId || opts.force) {
        // Create new execution
        executionId = opts.executionId || generateExecutionId();
        isNew = true;
        logger.info(chalk.blue(`⚡ Starting interactive execution: ${executionId}`));
    }

    let executor: MachineExecutor;
    let metadata: ExecutionMetadata;
    let machineData: MachineJSON;

    if (isNew || !(await executionExists(executionId))) {
        // Create new execution
        logger.debug('Creating new execution');

        // Validate machine source is provided for new execution
        if (!opts.machineSource) {
            throw new Error('Machine source required when creating new execution');
        }

        // Load or create machine from source
        if (opts.isStdin) {
            // Parse machine from stdin source
            machineData = await parseMachineFromSource(opts.machineSource);
        } else {
            // Load machine from file
            machineData = await loadMachineFromFile(opts.machineSource);
        }

        // Configure client
        const clientConfig = configureClient(opts);

        // Show mode info
        if (opts.playback) {
            logger.info(chalk.gray(`   Mode: playback (${opts.playback})`));
        } else if (opts.record) {
            logger.info(chalk.gray(`   Mode: interactive (recording to ${opts.record})`));
        }

        // Create executor
        executor = await MachineExecutor.create(machineData, clientConfig);

        // Create metadata
        metadata = {
            id: executionId,
            machineFile: opts.isStdin ? undefined : opts.machineSource,
            machineSource: opts.isStdin ? 'stdin' : 'file',
            startedAt: new Date().toISOString(),
            lastExecutedAt: new Date().toISOString(),
            turnCount: 0,
            stepCount: 0,
            status: 'in_progress',
            mode: opts.playback ? 'playback' : 'interactive',
            clientConfig: {
                type: opts.playback ? 'playback' : opts.record ? 'interactive' : 'api',
                playbackDir: opts.playback,
                recordingsDir: opts.record
            }
        };

        await saveExecutionMetadata(executionId, metadata);
        await saveMachineSnapshot(executionId, machineData);

        // Update "last" symlink
        await updateLastSymlink(executionId);

    } else {
        // Resume existing execution - load from snapshot (not source file)
        logger.debug('Resuming existing execution');

        const state: ExecutionStateFile = await loadExecutionState(executionId);
        metadata = await loadExecutionMetadata(executionId);

        // Load machine from snapshot (which may have been modified by meta-tools)
        machineData = await loadMachineSnapshot(executionId);

        // Show mode info
        if (metadata.mode === 'playback') {
            logger.info(chalk.gray(`   Mode: playback (${metadata.clientConfig?.playbackDir})`));
        } else if (metadata.clientConfig?.recordingsDir) {
            logger.info(chalk.gray(`   Mode: interactive (recording to ${metadata.clientConfig.recordingsDir})`));
        }

        // Recreate client with same config
        const clientConfig = configureClient({
            ...opts,
            playback: metadata.clientConfig?.playbackDir,
            record: metadata.clientConfig?.recordingsDir
        });

        // Recreate executor with snapshot machine
        executor = await MachineExecutor.create(machineData, clientConfig);

        // Restore execution state
        const currentExecState = executor.getState();
        const restoredState = {
            ...currentExecState,
            contextState: state.executionState.contextValues,
            turnState: state.executionState.turnState,
            // Restore full paths array if available, otherwise use legacy single-path restore
            paths: state.executionState.paths || currentExecState.paths.map((path, index) => {
                if (index === 0) {
                    // Legacy restore: only restore the first path
                    return {
                        ...path,
                        currentNode: state.executionState.currentNode,
                        // Note: We keep the newly initialized history as the executor
                        // will properly reconstruct it during execution
                    };
                }
                return path;
            }),
            // Restore barrier state
            barriers: state.executionState.barriers || {}
        };
        executor.setState(restoredState);

        logger.debug(chalk.gray(`   State restored: ${state.executionState.currentNode}`));
    }

    return { executor, metadata, isNew };
}

/**
 * Get execution status from state
 */
function getExecutionStatus(state: any): 'in_progress' | 'complete' | 'error' | 'paused' {
    if (!state.paths || state.paths.length === 0) {
        return 'in_progress';
    }

    const activePath = state.paths[0];
    if (activePath.status === 'complete') return 'complete';
    if (activePath.status === 'error') return 'error';
    if (state.turnState) return 'paused';
    return 'in_progress';
}

/**
 * Save current execution state
 */
export async function saveCurrentExecutionState(
    executionId: string,
    executor: MachineExecutor,
    metadata: ExecutionMetadata
): Promise<void> {
    // Get current state from executor
    const execState = executor.getState();
    const machineData = executor.getMachineDefinition();
    
    logger.debug(`Saving machine with ${machineData.nodes.length} nodes: ${machineData.nodes.map(n => n.name).join(', ')}`);

    // Get the active path (first path)
    const activePath = execState.paths[0];

    // Create state file with updated machine hash
    const updatedMachineHash = hashMachine(machineData);
    const state: ExecutionStateFile = {
        version: STATE_CONFIG.stateVersion,
        machineHash: updatedMachineHash,  // Updated hash to reflect machine modifications
        executionState: {
            currentNode: activePath?.currentNode || '',
            pathId: activePath?.id || '',
            visitedNodes: activePath ? Array.from(new Set([
                ...activePath.history.map(t => t.from),
                ...activePath.history.map(t => t.to),
                activePath.currentNode
            ])) : [],
            attributes: {},
            contextValues: execState.contextState || {},
            turnState: execState.turnState,
            paths: execState.paths,           // Save full paths array
            barriers: execState.barriers       // Save barrier state
        },
        status: getExecutionStatus(execState),
        lastUpdated: new Date().toISOString()
    };

    await saveExecutionState(executionId, state);

    // Save machine snapshot (in case it was modified by meta-tools)
    await saveMachineSnapshot(executionId, machineData);

    // Update metadata
    metadata.lastExecutedAt = new Date().toISOString();
    metadata.status = state.status;
    metadata.stepCount = activePath?.stepCount || 0;
    if (executor.isInTurn()) {
        metadata.turnCount = executor.getTurnState()?.turnCount || metadata.turnCount;
    }

    await saveExecutionMetadata(executionId, metadata);

    logger.success(chalk.gray('💾 State saved'));
}

/**
 * Display runtime snapshot using RuntimeVisualizer
 */
function displayRuntimeSnapshot(executor: MachineExecutor, opts: { verbose?: boolean; format?: string }): void {
    const visualizer = new RuntimeVisualizer(executor);
    const snapshot = visualizer.generateRuntimeSnapshot();
    const format = opts.format || 'text';

    switch (format) {
        case 'json':
            logger.output(formatRuntimeSnapshotJSON(snapshot));
            break;

        case 'svg':
        case 'dot':
            // Generate Graphviz diagram
            const dotOutput = visualizer.generateRuntimeVisualization({ format: 'class' });
            logger.output(dotOutput);
            break;

        case 'text':
        default:
            if (opts.verbose) {
                // Full snapshot in verbose mode
                logger.output(formatRuntimeSnapshot(snapshot));
            } else {
                // Compact summary by default
                const compact = formatRuntimeSnapshotCompact(snapshot);
                logger.info(chalk.gray(`📊 ${compact}`));
            }
            break;
    }
}

/**
 * Display turn result (legacy - for turn-based output)
 */
function displayTurnResult(result: any): void {
    logger.success(chalk.green('✓ Turn completed'));

    if (result.toolExecutions && result.toolExecutions.length > 0) {
        logger.info(chalk.blue('  Tools: ') + result.toolExecutions.map((t: any) => t.toolName).join(', '));

        // Show tool details in verbose mode
        if (logger['level'] === 'verbose') {
            result.toolExecutions.forEach((tool: any) => {
                logger.debug(chalk.gray(`    ${tool.toolName}:`));
                if (tool.parameters) {
                    logger.debug(chalk.gray(`      params: ${JSON.stringify(tool.parameters).slice(0, 100)}`));
                }
                if (tool.result) {
                    logger.debug(chalk.gray(`      result: ${String(tool.result).slice(0, 100)}...`));
                }
            });
        }
    }

    if (result.text) {
        const preview = result.text.slice(0, 100);
        logger.info(chalk.blue('  Output: ') + preview + (result.text.length > 100 ? '...' : ''));
    }

    if (result.nextNode) {
        logger.info(chalk.blue('  Next: ') + chalk.bold(result.nextNode));
    }
}

/**
 * Display final results
 */
function displayFinalResults(executor: MachineExecutor, metadata: ExecutionMetadata): void {
    const state = executor.getState();
    const activePath = state.paths[0];

    logger.heading(chalk.bold('\n📊 Final Results:'));
    logger.info(`  Execution ID: ${metadata.id}`);
    logger.info(`  Total turns: ${metadata.turnCount}`);
    logger.info(`  Total steps: ${metadata.stepCount}`);
    logger.info(`  Status: ${metadata.status}`);
    logger.info(`  Started: ${new Date(metadata.startedAt).toLocaleString()}`);
    logger.info(`  Completed: ${new Date(metadata.lastExecutedAt).toLocaleString()}`);

    if (activePath && activePath.history.length > 0) {
        logger.info(chalk.blue('\n  Execution path:'));
        activePath.history.forEach((step: any) => {
            logger.info(chalk.cyan(`    ${step.from}`) + chalk.gray(` --(${step.transition})--> `) + chalk.cyan(`${step.to}`));
        });
    }
}

/**
 * Execute machine with specified execution mode
 * - No flags: Run to completion
 * - --interactive: Run until LLM needed or completion
 * - --step: Execute one step, pause
 * - --step-turn: Execute one turn, pause
 * - --interactive --step: Execute one step, pause on LLM or after step
 * - --interactive --step-turn: Execute one turn, pause on LLM or after turn
 */
export async function executeInteractiveTurn(
    machineSource: string,
    opts: {
        id?: string;
        playback?: string;
        record?: string;
        force?: boolean;
        verbose?: boolean;
        input?: any;
        isStdin?: boolean;
        interactive?: boolean;
        step?: boolean;
        stepTurn?: boolean;
        stepPath?: boolean;
        format?: string;
    }
): Promise<void> {
    // Load or create execution
    const { executor, metadata } = await loadOrCreateExecution({
        machineSource,
        executionId: opts.id,
        playback: opts.playback,
        record: opts.record,
        force: opts.force,
        isStdin: opts.isStdin,
        isInteractive: opts.interactive,
        input: opts.input
    });

    const executionId = metadata.id;

    // Check if already complete
    const state = executor.getState();
    const status = getExecutionStatus(state);
    if (status === 'complete') {
        logger.success(chalk.green('✅ Execution already complete!'));
        displayFinalResults(executor, metadata);
        return;
    }

    // Determine execution mode
    const isStepMode = opts.step || opts.stepTurn || opts.stepPath;
    const shouldLoop = !isStepMode; // Loop if not in step mode

    // Show mode info
    if (opts.step) {
        logger.info(chalk.gray('🔍 Step mode: executing one step at a time (all paths)'));
    } else if (opts.stepTurn) {
        logger.info(chalk.gray('🔍 Step-turn mode: executing one turn at a time'));
    } else if (opts.stepPath) {
        logger.info(chalk.gray('🔍 Step-path mode: executing one path at a time'));
    } else if (opts.interactive) {
        logger.info(chalk.gray('🔄 Interactive mode: running until LLM response needed'));
    }

    // For step-path mode, track which path to step next
    let currentPathId: string | undefined;
    if (opts.stepPath && !metadata.nextPathId) {
        // Initialize with first active path
        currentPathId = executor.getNextActivePathId();
        metadata.nextPathId = currentPathId;
    } else if (opts.stepPath) {
        // Resume from saved path
        currentPathId = metadata.nextPathId;
    }

    // Execute loop
    let iterationCount = 0;
    const maxIterations = shouldLoop ? 1000 : 1; // Safety limit for loop mode

    while (iterationCount < maxIterations) {
        iterationCount++;

        try {
            let result: any;

            // Execute based on mode
            if (opts.stepPath) {
                // Step-path mode: execute one path at a time
                if (!currentPathId) {
                    logger.error('No active paths to step');
                    return;
                }

                const currentState = executor.getState();
                const pathToStep = currentState.paths.find(p => p.id === currentPathId);

                if (!pathToStep) {
                    logger.error(`Path ${currentPathId} not found`);
                    return;
                }

                logger.info(chalk.cyan(`\n📍 Step ${metadata.stepCount + 1} - Path: ${currentPathId} - Node: ${pathToStep.currentNode}`));

                const hasMore = await executor.stepPath(currentPathId);
                result = {
                    status: hasMore ? 'in_progress' : 'complete',
                    stepCount: metadata.stepCount + 1
                };
                metadata.stepCount++;

                // Move to next path (round-robin)
                currentPathId = executor.getNextActivePathId(currentPathId);
                metadata.nextPathId = currentPathId;

            } else if (opts.step) {
                // Step mode: execute one step (all paths)
                const currentState = executor.getState();
                const currentNode = currentState.paths[0]?.currentNode || '';
                logger.info(chalk.cyan(`\n📍 Step ${metadata.stepCount + 1} - Node: ${currentNode}`));

                const hasMore = await executor.step();
                result = {
                    status: hasMore ? 'in_progress' : 'complete',
                    stepCount: metadata.stepCount + 1
                };
                metadata.stepCount++;
            } else {
                // Turn mode (default): execute one turn
                if (executor.isInTurn()) {
                    // Continue turn
                    const turnState = executor.getTurnState();
                    logger.info(chalk.cyan(`\n📍 Turn ${turnState!.turnCount} - Node: ${turnState!.nodeName}`));
                    result = await executor.stepTurn();
                } else {
                    // Start new turn
                    const currentState = executor.getState();
                    const currentNode = currentState.paths[0]?.currentNode || '';
                    logger.info(chalk.cyan(`\n📍 Current Node: ${currentNode}`));
                    result = await executor.stepTurn();
                }

                // Display turn result
                displayTurnResult(result);

                // Create history entry
                const updatedState = executor.getState();
                const historyEntry: TurnHistoryEntry = {
                    turn: result.turnCount || metadata.turnCount + 1,
                    timestamp: new Date().toISOString(),
                    node: result.nodeName || updatedState.paths[0]?.currentNode || '',
                    tools: result.toolExecutions?.map((t: any) => t.toolName) || [],
                    output: result.text?.slice(0, 100),
                    status: result.status
                };

                // Append to history
                await appendTurnHistory(executionId, historyEntry);

                // Increment turn count if turn completed
                if (result.status !== 'in_turn') {
                    metadata.turnCount++;
                }
            }

            // Save state
            await saveCurrentExecutionState(executionId, executor, metadata);

            // Display runtime snapshot
            displayRuntimeSnapshot(executor, { verbose: opts.verbose, format: opts.format });

            // Check if complete
            const finalStatus = getExecutionStatus(executor.getState());
            if (finalStatus === 'complete') {
                logger.success(chalk.green('\n✅ Execution complete!'));
                displayFinalResults(executor, metadata);
                return;
            }

            // Exit loop if in step mode (only execute once)
            if (isStepMode) {
                logger.info(chalk.gray(`\n💾 State saved. Run again to continue.`));
                return;
            }

        } catch (error) {
            // Handle pending response (interactive mode)
            if (error instanceof PendingResponseError) {
                logger.info(chalk.yellow('\n⏸️  Waiting for LLM response...\n'));
                logger.output(chalk.dim('─'.repeat(60)));
                logger.output(chalk.bold('LLM REQUEST:'));
                logger.output(error.request);
                logger.output(chalk.dim('─'.repeat(60)));
                logger.output(chalk.bold('\nEXAMPLE RESPONSE:'));
                logger.output(error.exampleResponse);
                logger.output(chalk.dim('─'.repeat(60)));
                logger.info(chalk.cyan('\n💡 Provide response via stdin:'));
                logger.info(chalk.gray(`   echo '<response-json>' | dygram execute <machine> --interactive --id ${executionId}\n`));

                // Save state as paused
                metadata.status = 'paused';
                await saveCurrentExecutionState(executionId, executor, metadata);
                return;
            }

            // Other errors
            logger.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));

            // Save error state
            metadata.status = 'error';
            await saveCurrentExecutionState(executionId, executor, metadata);

            throw error;
        }
    }

    // Safety check: if we hit max iterations
    if (shouldLoop) {
        logger.warn(chalk.yellow(`\n⚠️  Reached maximum iterations (${maxIterations}). Execution paused.`));
        logger.info(chalk.gray(`   Run again to continue: dygram execute --interactive --id ${executionId}\n`));
    }
}
