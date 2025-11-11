import { describe, it, expect } from 'vitest';
import { generateDotDiagram } from '../../src/language/diagram/graphviz-dot-diagram.js';
import type { MachineJSON } from '../../src/language/diagram/types.js';

describe('cluster note rendering', () => {
    it('links notes targeting clusters to the cluster anchor', () => {
        const machineJson: MachineJSON = {
            title: 'Cluster Notes',
            nodes: [
                { name: 'Cluster', type: 'process' },
                { name: 'TaskA', type: 'task', parent: 'Cluster' },
                { name: 'Cluster', type: 'note', title: 'Cluster overview', parent: 'Cluster' }
            ],
            edges: []
        };

        const dotOutput = generateDotDiagram(machineJson);

        expect(dotOutput).toContain('subgraph cluster_Cluster');
        expect(dotOutput).toContain('"Cluster__cluster_anchor" [shape=point');
        expect(dotOutput).toContain('"note_Cluster_0" -> "Cluster__cluster_anchor"');
        expect(dotOutput).not.toContain('"note_Cluster_0" -> "Cluster" [');
    });
});
