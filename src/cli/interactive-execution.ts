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
import { logger } from './logger.js';
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
    getExecutionDir,
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
    const tempFile = path.join(os.tmpdir(), `dygram-stdin-${Date.now()}.dygram`);
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

    if (opts.record) {
        return {
            llm: new InteractiveTestClient({
                mode: 'file-queue',
                queueDir: '.dygram-interactive-queue',
                recordResponses: true,
                recordingsDir: opts.record,
                timeout: 60000
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
        executionId = await getLastExecutionId();
        if (executionId) {
            logger.info(chalk.blue(`⚡ Resuming execution: ${executionId}`));
        }
    }

    if (!executionId || opts.force) {
        // Create new execution
        executionId = opts.executionId || generateExecutionId();
        isNew = true;
        logger.info(chalk.blue(`⚡ Starting interactive execution: ${executionId}`));
    }

    // Load or create machine
    let machineData: MachineJSON;
    if (opts.isStdin) {
        // Parse machine from stdin source
        machineData = await parseMachineFromSource(opts.machineSource);
    } else {
        // Load machine from file
        machineData = await loadMachineFromFile(opts.machineSource);
    }
    const machineHash = hashMachine(machineData);

    let executor: MachineExecutor;
    let metadata: ExecutionMetadata;

    if (isNew || !(await executionExists(executionId))) {
        // Create new execution
        logger.debug('Creating new execution');

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
        // Resume existing execution
        logger.debug('Resuming existing execution');

        const state: ExecutionStateFile = await loadExecutionState(executionId);
        metadata = await loadExecutionMetadata(executionId);

        // Verify machine hasn't changed
        if (state.machineHash !== machineHash) {
            throw new Error(
                `Machine definition has changed since execution started.\n` +
                `   Original hash: ${state.machineHash.slice(0, 8)}...\n` +
                `   Current hash:  ${machineHash.slice(0, 8)}...\n\n` +
                `   Options:\n` +
                `   - Use --force to start a new execution\n` +
                `   - Restore original machine definition\n` +
                `   - Use --id to start a parallel execution`
            );
        }

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

        // Load machine from snapshot
        machineData = await loadMachineSnapshot(executionId);

        // Recreate executor
        executor = await MachineExecutor.create(machineData, clientConfig);

        // TODO: Restore execution state
        // This requires a new method on MachineExecutor: executor.restoreState(state.executionState)
        // For now, we'll note this limitation
        logger.warn(chalk.yellow('   Note: State restoration not yet fully implemented'));
    }

    return { executor, metadata, isNew };
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
    const executionState = executor.getExecutionState();
    const machineData = executor.getMachineData();

    // Create state file
    const state: ExecutionStateFile = {
        version: STATE_CONFIG.stateVersion,
        machineHash: hashMachine(machineData),
        executionState: {
            currentNode: executionState.currentNode,
            pathId: executionState.pathId,
            visitedNodes: Array.from(executionState.visitedNodes || []),
            attributes: Object.fromEntries(executionState.attributes || []),
            contextValues: executionState.contextValues || {},
            turnState: executionState.turnState
        },
        status: executor.getStatus() as any,
        lastUpdated: new Date().toISOString()
    };

    await saveExecutionState(executionId, state);

    // Update metadata
    metadata.lastExecutedAt = new Date().toISOString();
    metadata.status = executor.getStatus() as any;
    if (executor.isInTurn()) {
        metadata.turnCount = executor.getTurnState()?.turnCount || metadata.turnCount;
    }

    await saveExecutionMetadata(executionId, metadata);

    logger.success(chalk.gray('💾 State saved'));
}

/**
 * Display turn result
 */
function displayTurnResult(result: any): void {
    logger.success(chalk.green('✓ Turn completed'));

    if (result.toolExecutions && result.toolExecutions.length > 0) {
        logger.info(chalk.blue('  Tools:'), result.toolExecutions.map((t: any) => t.toolName).join(', '));

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
        logger.info(chalk.blue('  Output:'), preview + (result.text.length > 100 ? '...' : ''));
    }

    if (result.nextNode) {
        logger.info(chalk.blue('  Next:'), chalk.bold(result.nextNode));
    }
}

/**
 * Display final results
 */
function displayFinalResults(executor: MachineExecutor, metadata: ExecutionMetadata): void {
    const result = executor.getExecutionResult();

    logger.heading(chalk.bold('\n📊 Final Results:'));
    logger.info(`  Execution ID: ${metadata.id}`);
    logger.info(`  Total turns: ${metadata.turnCount}`);
    logger.info(`  Total steps: ${result.history.length}`);
    logger.info(`  Status: ${result.status}`);
    logger.info(`  Started: ${new Date(metadata.startedAt).toLocaleString()}`);
    logger.info(`  Completed: ${new Date(metadata.lastExecutedAt).toLocaleString()}`);

    if (result.history.length > 0) {
        logger.info(chalk.blue('\n  Execution path:'));
        result.history.forEach((step: any) => {
            logger.info(chalk.cyan(`    ${step.from}`) + chalk.gray(` --(${step.transition})--> `) + chalk.cyan(`${step.to}`));
        });
    }
}

/**
 * Execute one interactive turn
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
    }
): Promise<void> {
    // Load or create execution
    const { executor, metadata, isNew } = await loadOrCreateExecution({
        machineSource,
        executionId: opts.id,
        playback: opts.playback,
        record: opts.record,
        force: opts.force,
        isStdin: opts.isStdin
    });

    const executionId = metadata.id;

    // Check if already complete
    if (executor.getStatus() === 'complete') {
        logger.success(chalk.green('✅ Execution already complete!'));
        displayFinalResults(executor, metadata);
        return;
    }

    // Handle stdin input (for manual mode - future)
    if (opts.input) {
        logger.debug('Received input:', opts.input);
        // TODO: Apply input to executor for manual mode
    }

    // Execute next turn
    try {
        let result: any;

        if (executor.isInTurn()) {
            // Continue turn
            const turnState = executor.getTurnState();
            logger.info(chalk.cyan(`\n📍 Turn ${turnState!.turnCount} - Node: ${turnState!.nodeName}`));
            result = await executor.stepTurn();
        } else {
            // Start new turn (step to next node if needed)
            const currentNode = executor.getCurrentNode();
            logger.info(chalk.cyan(`\n📍 Current Node: ${currentNode}`));
            result = await executor.stepTurn();
        }

        // Display turn result
        displayTurnResult(result);

        // Create history entry
        const historyEntry: TurnHistoryEntry = {
            turn: result.turnCount || metadata.turnCount + 1,
            timestamp: new Date().toISOString(),
            node: result.nodeName || executor.getCurrentNode(),
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

        // Save state
        await saveCurrentExecutionState(executionId, executor, metadata);

        // Check if complete
        if (executor.getStatus() === 'complete') {
            logger.success(chalk.green('\n✅ Execution complete!'));
            displayFinalResults(executor, metadata);
        }

    } catch (error) {
        logger.error(chalk.red(`\n❌ Error: ${error instanceof Error ? error.message : String(error)}`));

        // Save error state
        metadata.status = 'error';
        await saveCurrentExecutionState(executionId, executor, metadata);

        throw error;
    }
}
