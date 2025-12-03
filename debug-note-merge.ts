#!/usr/bin/env node
/**
 * Debug script for note merge issue
 * Tests: Does note overwrite concept type during initial parse or during round-trip?
 */

import { createMachineServices } from './src/language/machine-module.js';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from './src/language/generated/ast.js';
import { generateJSON, generateDSL } from './src/language/generator/generator.js';

// Test case: Concept + Note with qualified name
const testSource = `machine "Note Merge Debug Test"

concept Language {
    concept ArrowTypes "Relationship Semantics" {
        basic: "->";
        strong: "-->";
    }
}

note Language.ArrowTypes "Documentation for ArrowTypes" @KeyFeature;
`;

console.log('='.repeat(80));
console.log('DEBUG: Note Merge Issue');
console.log('='.repeat(80));
console.log('\nTest Source:');
console.log(testSource);
console.log('\n' + '='.repeat(80));

async function debugNoteMerge() {
    const services = createMachineServices(EmptyFileSystem);
    const parse = parseHelper<Machine>(services.Machine);

    // Step 1: Parse DSL to AST
    console.log('\n[STEP 1] Parsing DSL to AST...');
    const document = await parse(testSource, { validation: true });
    const machine = document.parseResult.value;

    // Check parse errors
    if (document.parseResult.lexerErrors.length > 0 || document.parseResult.parserErrors.length > 0) {
        console.error('Parse errors:', {
            lexer: document.parseResult.lexerErrors,
            parser: document.parseResult.parserErrors
        });
        process.exit(1);
    }

    console.log('✓ Parse successful');

    // Step 2: Check AST before serialization
    console.log('\n[STEP 2] Examining AST nodes BEFORE serialization...');

    function inspectNodes(nodes, indent = 0) {
        const prefix = '  '.repeat(indent);
        nodes.forEach(node => {
            console.log(`${prefix}Node: "${node.name}"`);
            console.log(`${prefix}  type: "${node.type}"`);
            console.log(`${prefix}  title: "${node.title || '(none)'}"`);
            console.log(`${prefix}  attributes: ${node.attributes?.length || 0}`);
            if (node.nodes && node.nodes.length > 0) {
                console.log(`${prefix}  children:`);
                inspectNodes(node.nodes, indent + 2);
            }
        });
    }

    inspectNodes(machine.nodes);

    // Step 3: Serialize to JSON (first time)
    console.log('\n[STEP 3] Serializing AST to JSON (initial)...');
    const jsonResult1 = generateJSON(machine, 'test.dy', undefined);
    const json1 = JSON.parse(jsonResult1.content);

    console.log('JSON nodes:');
    json1.nodes.forEach(node => {
        console.log(`  - ${node.name}: type="${node.type}", title="${node.title || '(none)'}", parent="${node.parent || 'root'}"`);
    });

    // Step 4: Check ArrowTypes specifically
    console.log('\n[STEP 4] Checking ArrowTypes node...');
    const arrowTypesNode = json1.nodes.find(n => n.name === 'ArrowTypes');

    if (!arrowTypesNode) {
        console.error('❌ ArrowTypes node not found!');
    } else {
        console.log('ArrowTypes node found:');
        console.log('  type:', arrowTypesNode.type);
        console.log('  title:', arrowTypesNode.title);
        console.log('  parent:', arrowTypesNode.parent);
        console.log('  attributes:', arrowTypesNode.attributes?.map(a => a.name).join(', '));
        console.log('  annotations:', arrowTypesNode.annotations?.map(a => a.name).join(', ') || 'none');

        if (arrowTypesNode.type === 'concept') {
            console.log('✓ CORRECT: Type is "concept"');
        } else {
            console.log(`❌ WRONG: Type is "${arrowTypesNode.type}" (should be "concept")`);
        }

        if (arrowTypesNode.title === 'Relationship Semantics') {
            console.log('✓ CORRECT: Title is from concept');
        } else {
            console.log(`❌ WRONG: Title is "${arrowTypesNode.title}" (should be "Relationship Semantics")`);
        }
    }

    // Step 5: Round-trip test (JSON → DSL → JSON)
    console.log('\n[STEP 5] Testing round-trip (JSON → DSL → JSON)...');

    // Generate DSL from JSON
    const dsl2 = generateDSL(json1);
    console.log('\nRegenerated DSL:');
    console.log('-'.repeat(40));
    console.log(dsl2);
    console.log('-'.repeat(40));

    // Parse the regenerated DSL
    const document2 = await parse(dsl2, { validation: true });
    const machine2 = document2.parseResult.value;

    // Serialize to JSON again
    const jsonResult2 = generateJSON(machine2, 'test.dy', undefined);
    const json2 = JSON.parse(jsonResult2.content);

    console.log('\nRound-trip JSON nodes:');
    json2.nodes.forEach(node => {
        console.log(`  - ${node.name}: type="${node.type}", title="${node.title || '(none)'}", parent="${node.parent || 'root'}"`);
    });

    // Step 6: Compare
    console.log('\n[STEP 6] Comparing original JSON vs round-trip JSON...');

    const arrowTypesNode2 = json2.nodes.find(n => n.name === 'ArrowTypes');

    if (!arrowTypesNode2) {
        console.error('❌ ArrowTypes node not found in round-trip!');
    } else {
        console.log('\nComparison:');
        console.log('  Original type:', arrowTypesNode.type);
        console.log('  Round-trip type:', arrowTypesNode2.type);

        if (arrowTypesNode.type === arrowTypesNode2.type) {
            console.log('  ✓ Types match');
        } else {
            console.log('  ❌ Types differ!');
        }

        console.log('\n  Original title:', arrowTypesNode.title);
        console.log('  Round-trip title:', arrowTypesNode2.title);

        if (arrowTypesNode.title === arrowTypesNode2.title) {
            console.log('  ✓ Titles match');
        } else {
            console.log('  ❌ Titles differ!');
        }
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    if (arrowTypesNode.type === 'concept') {
        console.log('✓ Initial serialization: CORRECT (concept type preserved)');
    } else {
        console.log('❌ Initial serialization: BROKEN (concept became ' + arrowTypesNode.type + ')');
        console.log('   → Bug happens during DSL→JSON serialization');
    }

    if (arrowTypesNode.type === arrowTypesNode2.type) {
        console.log('✓ Round-trip: STABLE (type unchanged)');
    } else {
        console.log('❌ Round-trip: BROKEN (type changed from ' + arrowTypesNode.type + ' to ' + arrowTypesNode2.type + ')');
        console.log('   → Bug happens during JSON→DSL→JSON round-trip');
    }

    console.log('='.repeat(80));
}

// Run the debug test
debugNoteMerge().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
