/**
 * Tests for Context Inheritance Feature
 *
 * Tests that child nodes automatically inherit read-only access to
 * context nodes accessible by their parent nodes
 */

import { describe, it, expect } from 'vitest';
import { ContextPermissionsResolver } from '../../src/language/utils/context-permissions.js';
import type { MachineData } from '../../src/language/base-executor.js';

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
                // Parent has access to config
                { source: 'Pipeline', target: 'config', label: 'reads' }
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
                // Parent has read access
                { source: 'Parent', target: 'data', label: 'reads' },
                // Child explicitly has write access (overrides inherited read-only)
                { source: 'Child', target: 'data', label: 'writes' }
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
                // GrandParent has access to config
                { source: 'GrandParent', target: 'config', label: 'reads' }
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
                { source: 'Parent', target: 'config', label: 'reads' }
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
                // Parent has write and store access
                { source: 'Parent', target: 'data', label: 'writes,store' }
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
});
