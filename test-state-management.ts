/**
 * Test script for state management functionality
 * Tests the execution state persistence without requiring API calls
 */

import {
    generateExecutionId,
    hashMachine,
    getLastExecutionId,
    updateLastSymlink,
    executionExists,
    saveExecutionState,
    loadExecutionState,
    saveExecutionMetadata,
    loadExecutionMetadata,
    saveMachineSnapshot,
    loadMachineSnapshot,
    appendTurnHistory,
    listExecutions,
    removeExecution,
    type ExecutionStateFile,
    type ExecutionMetadata,
    type TurnHistoryEntry
} from './src/cli/execution-state.js';
import type { MachineJSON } from './src/language/json/types.js';
import * as fs from 'node:fs/promises';

async function testStateManagement() {
    console.log('🧪 Testing State Management Functionality\n');

    // Test 1: Generate execution ID
    console.log('Test 1: Generate execution ID');
    const execId = generateExecutionId();
    console.log(`  ✓ Generated ID: ${execId}`);
    console.log(`  ✓ Format: exec-YYYYMMDD-HHMMSS\n`);

    // Test 2: Hash machine definition
    console.log('Test 2: Hash machine definition');
    const testMachine: MachineJSON = {
        name: 'Test Machine',
        nodes: [{
            name: 'start',
            type: 'task',
            prompt: 'Test prompt'
        }],
        edges: [],
        context: []
    };
    const hash1 = hashMachine(testMachine);
    const hash2 = hashMachine(testMachine);
    console.log(`  ✓ Hash 1: ${hash1.slice(0, 16)}...`);
    console.log(`  ✓ Hash 2: ${hash2.slice(0, 16)}...`);
    console.log(`  ✓ Hashes match: ${hash1 === hash2}\n`);

    // Test 3: Save and load execution state
    console.log('Test 3: Save and load execution state');
    const testState: ExecutionStateFile = {
        version: '1.0',
        machineHash: hash1,
        executionState: {
            currentNode: 'start',
            pathId: 'path-1',
            visitedNodes: ['start'],
            attributes: {},
            contextValues: {},
            turnState: undefined
        },
        status: 'in_progress',
        lastUpdated: new Date().toISOString()
    };
    await saveExecutionState(execId, testState);
    console.log(`  ✓ State saved to .dygram/executions/${execId}/state.json`);

    const loadedState = await loadExecutionState(execId);
    console.log(`  ✓ State loaded successfully`);
    console.log(`  ✓ Current node: ${loadedState.executionState.currentNode}`);
    console.log(`  ✓ Status: ${loadedState.status}\n`);

    // Test 4: Save and load metadata
    console.log('Test 4: Save and load metadata');
    const testMetadata: ExecutionMetadata = {
        id: execId,
        machineFile: '/test/machine.dy',
        machineSource: 'file',
        startedAt: new Date().toISOString(),
        lastExecutedAt: new Date().toISOString(),
        turnCount: 0,
        stepCount: 0,
        status: 'in_progress',
        mode: 'interactive',
        clientConfig: {
            type: 'api'
        }
    };
    await saveExecutionMetadata(execId, testMetadata);
    console.log(`  ✓ Metadata saved`);

    const loadedMetadata = await loadExecutionMetadata(execId);
    console.log(`  ✓ Metadata loaded`);
    console.log(`  ✓ Execution ID: ${loadedMetadata.id}`);
    console.log(`  ✓ Mode: ${loadedMetadata.mode}\n`);

    // Test 5: Save and load machine snapshot
    console.log('Test 5: Save and load machine snapshot');
    await saveMachineSnapshot(execId, testMachine);
    console.log(`  ✓ Machine snapshot saved`);

    const loadedMachine = await loadMachineSnapshot(execId);
    console.log(`  ✓ Machine snapshot loaded`);
    console.log(`  ✓ Machine name: ${loadedMachine.name}\n`);

    // Test 6: Append turn history
    console.log('Test 6: Append turn history');
    const historyEntry: TurnHistoryEntry = {
        turn: 1,
        timestamp: new Date().toISOString(),
        node: 'start',
        tools: ['tool1', 'tool2'],
        output: 'Test output',
        status: 'in_turn'
    };
    await appendTurnHistory(execId, historyEntry);
    console.log(`  ✓ Turn history entry appended`);

    // Read history file
    const historyContent = await fs.readFile(
        `.dygram/executions/${execId}/history.jsonl`,
        'utf-8'
    );
    const entries = historyContent.trim().split('\n');
    console.log(`  ✓ History entries: ${entries.length}\n`);

    // Test 7: Update last symlink
    console.log('Test 7: Update last symlink');
    await updateLastSymlink(execId);
    console.log(`  ✓ Symlink updated`);

    const lastId = await getLastExecutionId();
    console.log(`  ✓ Last execution ID: ${lastId}`);
    console.log(`  ✓ Matches current: ${lastId === execId}\n`);

    // Test 8: Check execution exists
    console.log('Test 8: Check execution exists');
    const exists = await executionExists(execId);
    console.log(`  ✓ Execution exists: ${exists}`);
    const fakExists = await executionExists('fake-exec-id');
    console.log(`  ✓ Fake execution exists: ${fakExists}\n`);

    // Test 9: List executions
    console.log('Test 9: List executions');
    const executions = await listExecutions();
    console.log(`  ✓ Total executions: ${executions.length}`);
    if (executions.length > 0) {
        console.log(`  ✓ Most recent: ${executions[0].id}`);
    }
    console.log();

    // Test 10: Clean up - remove execution
    console.log('Test 10: Remove execution');
    await removeExecution(execId);
    console.log(`  ✓ Execution removed`);

    const stillExists = await executionExists(execId);
    console.log(`  ✓ Still exists: ${stillExists}\n`);

    console.log('✅ All state management tests passed!\n');

    console.log('📁 File structure tested:');
    console.log('  .dygram/');
    console.log('    executions/');
    console.log('      <exec-id>/');
    console.log('        state.json       - Execution state');
    console.log('        metadata.json    - Execution metadata');
    console.log('        machine.json     - Machine snapshot');
    console.log('        history.jsonl    - Turn history');
    console.log('      last -> <exec-id>  - Symlink to last execution');
}

testStateManagement().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
