/**
 * Tests for Context Inheritance Feature
 *
 * Tests that child nodes automatically inherit read-only access to
 * context nodes accessible by their parent nodes
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { ContextPermissionsResolver } from '../../src/language/utils/context-permissions.js';
import type { MachineData } from '../../src/language/base-executor.js';
import { createMachineServices } from '../../src/language/machine-module.js';
import { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';

let services: ReturnType<typeof createMachineServices>;
let parse: ReturnType<typeof parseHelper<Machine>>;

const edge = (source: string, target: string, options: Partial<MachineData['edges'][number]> = {}): MachineData['edges'][number] => {
    const value = options.value ?? (options.label ? { text: options.label } : undefined);
    return {
        source,
        target,
        arrowType: options.arrowType ?? '->',
        annotations: options.annotations,
        value,
        attributes: options.attributes ?? (value ? { ...value } : undefined),
        type: options.type,
        label: options.label
    };
};

beforeAll(async () => {
    services = createMachineServices(EmptyFileSystem);
    parse = parseHelper<Machine>(services.Machine);
});

describe('Context Inheritance', () => {
    it('should inherit read-only access to parent context', () => {
        const machineData: MachineData = {
            title: 'Inheritance Test',
            nodes: [
                {
                    name: 'Pipeline',
                    type: 'group'
                },
                {
                    name: 'config',
                    type: 'context',
                    attributes: [
                        { name: 'apiKey', type: 'string', value: 'secret' }
                    ]
                },
                {
                    name: 'ChildTask',
                    type: 'task',
                    parent: 'Pipeline' // Child of Pipeline
                }
            ],
            edges: [
                edge('Pipeline', 'config', { value: { text: 'reads' } })
            ]
        };

        const childContexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'ChildTask',
            machineData,
            { includeInheritedContext: true }
        );

        // Child should inherit read access to config from parent
        expect(childContexts.has('config')).toBe(true);
        const configPerms = childContexts.get('config');
        expect(configPerms?.canRead).toBe(true);
        expect(configPerms?.canWrite).toBe(false); // Inherited as read-only
        expect(configPerms?.canStore).toBe(false); // No store permission
    });

    it('should allow explicit edges to override inherited permissions', () => {
        const machineData: MachineData = {
            title: 'Override Test',
            nodes: [
                {
                    name: 'Parent',
                    type: 'group'
                },
                {
                    name: 'data',
                    type: 'context'
                },
                {
                    name: 'Child',
                    type: 'task',
                    parent: 'Parent'
                }
            ],
            edges: [
                edge('Parent', 'data', { value: { text: 'reads' } }),
                edge('Child', 'data', { value: { text: 'writes' } })
            ]
        };

        const childContexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'Child',
            machineData,
            { includeInheritedContext: true }
        );

        // Explicit edge should take precedence
        expect(childContexts.has('data')).toBe(true);
        const dataPerms = childContexts.get('data');
        expect(dataPerms?.canWrite).toBe(true); // Explicit write access
    });

    it('should inherit from multiple levels (grandparent)', () => {
        const machineData: MachineData = {
            title: 'Multi-Level Inheritance',
            nodes: [
                {
                    name: 'GrandParent',
                    type: 'group'
                },
                {
                    name: 'Parent',
                    type: 'group',
                    parent: 'GrandParent'
                },
                {
                    name: 'Child',
                    type: 'task',
                    parent: 'Parent'
                },
                {
                    name: 'config',
                    type: 'context',
                    attributes: [
                        { name: 'setting', type: 'string', value: 'value' }
                    ]
                }
            ],
            edges: [
                edge('GrandParent', 'config', { value: { text: 'reads' } })
            ]
        };

        const childContexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'Child',
            machineData,
            { includeInheritedContext: true }
        );

        // Child should inherit from grandparent through parent
        expect(childContexts.has('config')).toBe(true);
        const configPerms = childContexts.get('config');
        expect(configPerms?.canRead).toBe(true);
        expect(configPerms?.canWrite).toBe(false);
    });

    it('should not inherit context when includeInheritedContext is false', () => {
        const machineData: MachineData = {
            title: 'No Inheritance Test',
            nodes: [
                {
                    name: 'Parent',
                    type: 'group'
                },
                {
                    name: 'config',
                    type: 'context'
                },
                {
                    name: 'Child',
                    type: 'task',
                    parent: 'Parent'
                }
            ],
            edges: [
                edge('Parent', 'config', { value: { text: 'reads' } })
            ]
        };

        const childContexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'Child',
            machineData,
            { includeInheritedContext: false }
        );

        // Should not have inherited access
        expect(childContexts.has('config')).toBe(false);
    });

    it('should never inherit write or store permissions', () => {
        const machineData: MachineData = {
            title: 'Write Inheritance Test',
            nodes: [
                {
                    name: 'Parent',
                    type: 'group'
                },
                {
                    name: 'data',
                    type: 'context'
                },
                {
                    name: 'Child',
                    type: 'task',
                    parent: 'Parent'
                }
            ],
            edges: [
                edge('Parent', 'data', { value: { text: 'writes,store' } })
            ]
        };

        const childContexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'Child',
            machineData,
            { includeInheritedContext: true }
        );

        // Child inherits access but only as read-only
        expect(childContexts.has('data')).toBe(true);
        const dataPerms = childContexts.get('data');
        expect(dataPerms?.canRead).toBe(true); // Has read from inheritance
        expect(dataPerms?.canWrite).toBe(false); // Write not inherited
        expect(dataPerms?.canStore).toBe(false); // Store not inherited
    });

    it('should handle nodes without parents (no inheritance)', () => {
        const machineData: MachineData = {
            title: 'No Parent Test',
            nodes: [
                {
                    name: 'StandaloneTask',
                    type: 'task'
                    // No parent field
                },
                {
                    name: 'config',
                    type: 'context'
                }
            ],
            edges: []
        };

        const contexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'StandaloneTask',
            machineData,
            { includeInheritedContext: true }
        );

        // No inherited contexts (no parent)
        expect(contexts.size).toBe(0);
    });

    it('should populate parent field when generating JSON from DSL', async () => {
        const dsl = `
            machine "Parent Field Test"

            group Pipeline {
                task ChildTask;
            }

            context config;
            Pipeline -reads-> config;
        `;

        const document = await parse(dsl);
        const result = generateJSON(document.parseResult.value);
        const machineData = JSON.parse(result.content);

        // Find the nodes
        const pipeline = machineData.nodes.find((n: any) => n.name === 'Pipeline');
        const childTask = machineData.nodes.find((n: any) => n.name === 'ChildTask');

        // Pipeline should have no parent (top-level)
        expect(pipeline).toBeDefined();
        expect(pipeline.parent).toBeUndefined();

        // ChildTask should have Pipeline as parent
        expect(childTask).toBeDefined();
        expect(childTask.parent).toBe('Pipeline');
        expect(childTask.type).toBe('task'); // Type should be preserved, not replaced by parent name

        // Now test that inheritance actually works with this generated JSON
        const contexts = ContextPermissionsResolver.getAccessibleContextNodes(
            'ChildTask',
            machineData,
            { includeInheritedContext: true }
        );

        // ChildTask should inherit read access to config from Pipeline
        expect(contexts.has('config')).toBe(true);
        const configPerms = contexts.get('config');
        expect(configPerms?.canRead).toBe(true);
        expect(configPerms?.canWrite).toBe(false);
    });
});
