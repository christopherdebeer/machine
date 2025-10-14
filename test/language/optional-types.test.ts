/**
 * Tests for optional type inference
 * Validates that node types can be inferred when not explicitly provided
 */

import { describe, it, expect } from 'vitest';
import { NodeTypeChecker, NodeLike, EdgeLike } from '../../src/language/node-type-checker.js';

describe('Optional Type Inference', () => {
    describe('getNodeType', () => {
        it('should return explicit type when provided', () => {
            const node: NodeLike = { name: 'test', type: 'task' };
            expect(NodeTypeChecker.getNodeType(node)).toBe('task');
        });

        it('should infer type when not provided', () => {
            const node: NodeLike = {
                name: 'process',
                attributes: [{ name: 'prompt', value: 'Do work' }]
            };
            expect(NodeTypeChecker.getNodeType(node)).toBe('task');
        });

        it('should be case insensitive for explicit types', () => {
            const node: NodeLike = { name: 'test', type: 'TASK' };
            expect(NodeTypeChecker.getNodeType(node)).toBe('task');
        });
    });

    describe('Task Inference', () => {
        it('should infer task from prompt attribute', () => {
            const node: NodeLike = {
                name: 'process',
                attributes: [{ name: 'prompt', value: 'Do work' }]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('task');
            expect(NodeTypeChecker.isTask(node)).toBe(true);
        });

        it('should not infer task without prompt', () => {
            const node: NodeLike = {
                name: 'process',
                attributes: [{ name: 'timeout', value: '5000' }]
            };
            expect(NodeTypeChecker.inferType(node)).not.toBe('task');
        });

        it('should respect explicit task type even without prompt', () => {
            const node: NodeLike = {
                name: 'process',
                type: 'task',
                attributes: []
            };
            expect(NodeTypeChecker.isTask(node)).toBe(true);
        });
    });

    describe('Tool Inference', () => {
        it('should infer tool from input attribute', () => {
            const node: NodeLike = {
                name: 'calculator',
                attributes: [
                    { name: 'input', value: '{ x: number, y: number }' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
            expect(NodeTypeChecker.isTool(node)).toBe(true);
        });

        it('should infer tool from output attribute', () => {
            const node: NodeLike = {
                name: 'formatter',
                attributes: [
                    { name: 'output', value: '{ result: string }' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
        });

        it('should infer tool from parameters attribute', () => {
            const node: NodeLike = {
                name: 'api',
                attributes: [
                    { name: 'parameters', value: '{}' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
        });

        it('should infer tool from schema attribute', () => {
            const node: NodeLike = {
                name: 'validator',
                attributes: [
                    { name: 'schema', value: '{}' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
        });

        it('should infer tool from returns attribute', () => {
            const node: NodeLike = {
                name: 'getter',
                attributes: [
                    { name: 'returns', value: 'string' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
        });
    });

    describe('Context Inference', () => {
        it('should infer context from name containing "context"', () => {
            const node: NodeLike = { name: 'userContext', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
            expect(NodeTypeChecker.isContext(node)).toBe(true);
        });

        it('should infer context from name containing "data"', () => {
            const node: NodeLike = { name: 'userData', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from name containing "input"', () => {
            const node: NodeLike = { name: 'userInput', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from name containing "output"', () => {
            const node: NodeLike = { name: 'apiOutput', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from name containing "result"', () => {
            const node: NodeLike = { name: 'queryResult', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from name containing "config"', () => {
            const node: NodeLike = { name: 'appConfig', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from name containing "state"', () => {
            const node: NodeLike = { name: 'appState', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should infer context from only having data attributes', () => {
            const node: NodeLike = {
                name: 'settings',
                attributes: [
                    { name: 'apiKey', value: 'xxx' },
                    { name: 'timeout', value: '5000' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('context');
        });

        it('should not infer context if has executable attributes', () => {
            const node: NodeLike = {
                name: 'processor',
                attributes: [
                    { name: 'value', value: 'data' },
                    { name: 'prompt', value: 'process' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).not.toBe('context');
        });

        it('should not infer context from empty attributes', () => {
            const node: NodeLike = { name: 'simple', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).not.toBe('context');
        });
    });

    describe('Init Inference', () => {
        it('should infer init from graph structure (no incoming, has outgoing)', () => {
            const node: NodeLike = { name: 'start', attributes: [] };
            const edges: EdgeLike[] = [
                { source: 'start', target: 'process' }
            ];
            expect(NodeTypeChecker.inferType(node, edges)).toBe('init');
            expect(NodeTypeChecker.isInit(node, edges)).toBe(true);
        });

        it('should not infer init if has incoming edges', () => {
            const node: NodeLike = { name: 'middle', attributes: [] };
            const edges: EdgeLike[] = [
                { source: 'start', target: 'middle' },
                { source: 'middle', target: 'end' }
            ];
            expect(NodeTypeChecker.inferType(node, edges)).not.toBe('init');
        });

        it('should not infer init if has no outgoing edges', () => {
            const node: NodeLike = { name: 'isolated', attributes: [] };
            const edges: EdgeLike[] = [];
            expect(NodeTypeChecker.inferType(node, edges)).not.toBe('init');
        });

        it('should require edges parameter for init inference', () => {
            const node: NodeLike = { name: 'start', attributes: [] };
            // Without edges, cannot infer init
            expect(NodeTypeChecker.inferType(node)).not.toBe('init');
        });
    });

    describe('State Inference (Default)', () => {
        it('should infer state as default for simple nodes', () => {
            const node: NodeLike = { name: 'ready', attributes: [] };
            expect(NodeTypeChecker.inferType(node)).toBe('state');
            expect(NodeTypeChecker.isState(node)).toBe(true);
        });

        it('should infer state for control flow nodes', () => {
            const node: NodeLike = {
                name: 'waiting',
                attributes: []
            };
            expect(NodeTypeChecker.inferType(node)).toBe('state');
        });
    });

    describe('Inference Priority', () => {
        it('should prioritize prompt over name-based context inference', () => {
            const node: NodeLike = {
                name: 'processData', // has "data" in name
                attributes: [{ name: 'prompt', value: 'Process' }]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('task');
        });

        it('should prioritize tool attributes over context name', () => {
            const node: NodeLike = {
                name: 'dataInput', // has "data" and "input" in name
                attributes: [
                    { name: 'schema', value: '{}' }
                ]
            };
            expect(NodeTypeChecker.inferType(node)).toBe('tool');
        });

        it('should prioritize context attributes over init graph structure', () => {
            const node: NodeLike = {
                name: 'startConfig', // could be init
                attributes: [
                    { name: 'apiKey', value: 'xxx' }
                ]
            };
            const edges: EdgeLike[] = [
                { source: 'startConfig', target: 'process' }
            ];
            expect(NodeTypeChecker.inferType(node, edges)).toBe('context');
        });
    });

    describe('Backward Compatibility', () => {
        it('should work with explicit types (task)', () => {
            const node: NodeLike = {
                name: 'process',
                type: 'task',
                attributes: []
            };
            expect(NodeTypeChecker.isTask(node)).toBe(true);
        });

        it('should work with explicit types (state)', () => {
            const node: NodeLike = {
                name: 'ready',
                type: 'state',
                attributes: []
            };
            expect(NodeTypeChecker.isState(node)).toBe(true);
        });

        it('should work with explicit types (context)', () => {
            const node: NodeLike = {
                name: 'data',
                type: 'context',
                attributes: []
            };
            expect(NodeTypeChecker.isContext(node)).toBe(true);
        });

        it('should work with explicit types (init)', () => {
            const node: NodeLike = {
                name: 'start',
                type: 'init',
                attributes: []
            };
            expect(NodeTypeChecker.isInit(node)).toBe(true);
        });

        it('should work with explicit types (tool)', () => {
            const node: NodeLike = {
                name: 'api',
                type: 'tool',
                attributes: []
            };
            expect(NodeTypeChecker.isTool(node)).toBe(true);
        });

        it('should allow explicit type to override inference', () => {
            const node: NodeLike = {
                name: 'processor',
                type: 'state', // Explicit state
                attributes: [{ name: 'prompt', value: 'Work' }] // Would infer task
            };
            expect(NodeTypeChecker.getNodeType(node)).toBe('state');
            expect(NodeTypeChecker.isState(node)).toBe(true);
            expect(NodeTypeChecker.isTask(node)).toBe(false);
        });
    });

    describe('Mixed Usage', () => {
        it('should handle mix of explicit and inferred types in same machine', () => {
            const explicitTask: NodeLike = {
                name: 'task1',
                type: 'task',
                attributes: []
            };
            const inferredTask: NodeLike = {
                name: 'task2',
                attributes: [{ name: 'prompt', value: 'Work' }]
            };
            const explicitState: NodeLike = {
                name: 'ready',
                type: 'state',
                attributes: []
            };
            const inferredState: NodeLike = {
                name: 'waiting',
                attributes: []
            };

            expect(NodeTypeChecker.isTask(explicitTask)).toBe(true);
            expect(NodeTypeChecker.isTask(inferredTask)).toBe(true);
            expect(NodeTypeChecker.isState(explicitState)).toBe(true);
            // Node with no type and no attributes should infer as state (default)
            expect(NodeTypeChecker.isState(inferredState)).toBe(true);
        });
    });
});
