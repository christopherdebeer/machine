/**
 * Test script to set up test executions for CLI command testing
 */

import {
    generateExecutionId,
    hashMachine,
    updateLastSymlink,
    saveExecutionState,
    saveExecutionMetadata,
    saveMachineSnapshot,
    appendTurnHistory,
    type ExecutionStateFile,
    type ExecutionMetadata,
    type TurnHistoryEntry
} from './src/cli/execution-state.js';
import type { MachineJSON } from './src/language/json/types.js';

async function setupTestExecutions() {
    console.log('🔧 Setting up test executions for CLI testing\n');

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
    const machineHash = hashMachine(testMachine);

    // Create 3 test executions with different states

    // Execution 1: In progress (most recent)
    const exec1 = generateExecutionId();
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

    const state1: ExecutionStateFile = {
        version: '1.0',
        machineHash,
        executionState: {
            currentNode: 'start',
            pathId: 'path-1',
            visitedNodes: ['start'],
            attributes: {},
            contextValues: {},
            turnState: {
                nodeName: 'start',
                nodeType: 'task',
                turnCount: 2,
                stepCount: 3,
                conversationMessages: [],
                availableTools: []
            }
        },
        status: 'in_progress',
        lastUpdated: new Date().toISOString()
    };

    const meta1: ExecutionMetadata = {
        id: exec1,
        machineFile: 'examples/basic/hello-world.dy',
        machineSource: 'file',
        startedAt: new Date(Date.now() - 10000).toISOString(),
        lastExecutedAt: new Date().toISOString(),
        turnCount: 2,
        stepCount: 3,
        status: 'in_progress',
        mode: 'interactive',
        clientConfig: { type: 'api' }
    };

    await saveExecutionState(exec1, state1);
    await saveExecutionMetadata(exec1, meta1);
    await saveMachineSnapshot(exec1, testMachine);
    await appendTurnHistory(exec1, {
        turn: 1,
        timestamp: new Date(Date.now() - 8000).toISOString(),
        node: 'start',
        tools: ['tool1'],
        output: 'First turn output',
        status: 'complete'
    });
    await appendTurnHistory(exec1, {
        turn: 2,
        timestamp: new Date().toISOString(),
        node: 'start',
        tools: ['tool2', 'tool3'],
        output: 'Second turn output',
        status: 'in_turn'
    });

    console.log(`✓ Created execution 1: ${exec1}`);
    console.log(`  Status: in_progress, 2 turns, 3 steps`);

    // Update last symlink
    await updateLastSymlink(exec1);

    // Execution 2: Complete (older)
    await new Promise(resolve => setTimeout(resolve, 100));
    const exec2 = `exec-20251201-120000`; // Older timestamp

    const state2: ExecutionStateFile = {
        version: '1.0',
        machineHash,
        executionState: {
            currentNode: 'end',
            pathId: 'path-1',
            visitedNodes: ['start', 'middle', 'end'],
            attributes: {},
            contextValues: {},
            turnState: undefined
        },
        status: 'complete',
        lastUpdated: new Date(Date.now() - 86400000).toISOString() // 1 day ago
    };

    const meta2: ExecutionMetadata = {
        id: exec2,
        machineFile: 'examples/basic/simple-workflow.dy',
        machineSource: 'file',
        startedAt: new Date(Date.now() - 90000000).toISOString(),
        lastExecutedAt: new Date(Date.now() - 86400000).toISOString(),
        turnCount: 5,
        stepCount: 8,
        status: 'complete',
        mode: 'interactive',
        clientConfig: { type: 'api' }
    };

    await saveExecutionState(exec2, state2);
    await saveExecutionMetadata(exec2, meta2);
    await saveMachineSnapshot(exec2, testMachine);

    console.log(`✓ Created execution 2: ${exec2}`);
    console.log(`  Status: complete, 5 turns, 8 steps`);

    // Execution 3: Error state (oldest)
    await new Promise(resolve => setTimeout(resolve, 100));
    const exec3 = `exec-20251201-100000`; // Even older

    const state3: ExecutionStateFile = {
        version: '1.0',
        machineHash,
        executionState: {
            currentNode: 'middle',
            pathId: 'path-1',
            visitedNodes: ['start', 'middle'],
            attributes: {},
            contextValues: {},
            turnState: undefined
        },
        status: 'error',
        lastUpdated: new Date(Date.now() - 172800000).toISOString() // 2 days ago
    };

    const meta3: ExecutionMetadata = {
        id: exec3,
        machineFile: 'examples/basic/comprehensive-demo.dy',
        machineSource: 'file',
        startedAt: new Date(Date.now() - 180000000).toISOString(),
        lastExecutedAt: new Date(Date.now() - 172800000).toISOString(),
        turnCount: 3,
        stepCount: 4,
        status: 'error',
        mode: 'playback',
        clientConfig: {
            type: 'playback',
            playbackDir: './test/fixtures/recordings'
        }
    };

    await saveExecutionState(exec3, state3);
    await saveExecutionMetadata(exec3, meta3);
    await saveMachineSnapshot(exec3, testMachine);

    console.log(`✓ Created execution 3: ${exec3}`);
    console.log(`  Status: error, 3 turns, 4 steps`);

    console.log('\n✅ Test executions created!');
    console.log('\nNow test with CLI commands:');
    console.log('  npx tsx src/cli/main.ts exec list');
    console.log(`  npx tsx src/cli/main.ts exec status ${exec1}`);
    console.log(`  npx tsx src/cli/main.ts exec rm ${exec3}`);
    console.log('  npx tsx src/cli/main.ts exec clean');
}

setupTestExecutions().catch(error => {
    console.error('❌ Setup failed:', error);
    process.exit(1);
});
