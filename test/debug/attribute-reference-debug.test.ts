import { describe, it } from 'vitest';
import { createMachineServices } from '../../src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import type { Machine } from '../../src/language/generated/ast.js';
import { generateJSON } from '../../src/language/generator/generator.js';

const services = createMachineServices(EmptyFileSystem).Machine;
const parse = parseHelper<Machine>(services);

describe('Debug Attribute Reference Edge Generation', () => {
    it('should show what edges are generated for attribute references', async () => {
        const input = `
            machine "Refined"

            parent {
                spouse: "Alice";
                child1 {
                    age: 38;
                }
                child2 {
                    likes: apples;
                }
                note parent "Documenting parent context";
            }

            apples;

            parent.spouse -> parent.child1;
        `;

        const result = await parse(input);
        const json = await generateJSON(result.parseResult.value, '', {});
        const machineJson = JSON.parse(json.content);

        console.log('\n=== GENERATED JSON DEBUG ===');
        console.log('Total edges:', machineJson.edges.length);
        console.log('\nEdges:');
        machineJson.edges.forEach((edge: any, i: number) => {
            console.log(`\nEdge ${i}:`, JSON.stringify(edge, null, 2));
        });

        // Test expectations
        console.log('\n=== TEST EXPECTATIONS ===');
        const portEdge = machineJson.edges.find((edge: any) => edge.source === 'parent' && edge.target === 'child1');
        console.log('portEdge found:', !!portEdge);
        if (portEdge) {
            console.log('portEdge.sourceAttribute:', portEdge.sourceAttribute);
            console.log('portEdge.value:', portEdge.value);
        }

        const inferredEdge = machineJson.edges.find((edge: any) => edge.source === 'child2' && edge.target === 'apples');
        console.log('inferredEdge found:', !!inferredEdge);
        if (inferredEdge) {
            console.log('inferredEdge.value?.text:', inferredEdge.value?.text);
            console.log('inferredEdge.sourceAttribute:', inferredEdge.sourceAttribute);
        }

        console.log('\n=== NODES ===');
        machineJson.nodes.forEach((node: any) => {
            console.log(`\nNode: ${node.name} (type: ${node.type})`);
            if (node.attributes && node.attributes.length > 0) {
                console.log('Attributes:');
                node.attributes.forEach((attr: any) => {
                    console.log(`  - ${attr.name}: ${JSON.stringify(attr.value)} (type: ${attr.type || 'unknown'})`);
                });
            }
        });

        console.log('\n=== MACHINE AST ===');
        const machine = result.parseResult.value;
        console.log('Machine nodes count:', machine.nodes?.length || 0);
        console.log('Machine edges count:', machine.edges?.length || 0);

        if (machine.edges && machine.edges.length > 0) {
            console.log('\n=== EDGE AST ===');
            machine.edges.forEach((edge: any, i: number) => {
                console.log(`\nEdge ${i}:`);
                console.log('  Source refs:', edge.source?.length || 0);
                edge.source?.forEach((src: any, j: number) => {
                    console.log(`    Source ${j}:`, src.ref?.name || 'no ref');
                    console.log('      $refText:', src.$refText);
                    console.log('      $refNode.text:', src.$refNode?.$cstNode?.text);
                    if (src.$cstNode) {
                        console.log('      CST text:', src.$cstNode.text);
                    }
                });
                console.log('  Segments:', edge.segments?.length || 0);
                edge.segments?.forEach((seg: any, k: number) => {
                    console.log(`    Segment ${k}:`);
                    console.log('      Target refs:', seg.target?.length || 0);
                    seg.target?.forEach((tgt: any, l: number) => {
                        console.log(`        Target ${l}:`, tgt.ref?.name || tgt.$cstNode?.text || 'unknown');
                        if (tgt.$cstNode) {
                            console.log('          CST text:', tgt.$cstNode.text);
                        }
                    });
                });
            });
        }

        function printNode(node: any, indent = '') {
            console.log(`${indent}AST Node: ${node.name}`);
            if (node.attributes) {
                console.log(`${indent}AST Attributes:`);
                node.attributes.forEach((attr: any) => {
                    console.log(`${indent}  - ${attr.name}:`, attr.value?.value || attr.value);
                    if (attr.value && typeof attr.value === 'object') {
                        console.log(`${indent}    Value $type:`, attr.value.$type);
                        console.log(`${indent}    Value.value:`, attr.value.value);
                        console.log(`${indent}    Value.value type:`, typeof attr.value.value);

                        // Check if value is an ID that could be a node reference
                        if (attr.value.$type === 'PrimitiveValue' && typeof attr.value.value === 'string') {
                            console.log(`${indent}    -> Could be node reference to "${attr.value.value}"`);
                        }
                    }
                });
            }
            if (node.nodes && node.nodes.length > 0) {
                console.log(`${indent}Nested nodes: ${node.nodes.length}`);
                node.nodes.forEach((child: any) => printNode(child, indent + '  '));
            }
        }

        if (machine.nodes) {
            machine.nodes.forEach((node: any) => printNode(node));
        }
    });
});
