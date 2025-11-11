import type { Machine } from '../../src/language/generated/ast.js';
import type { MachineData } from '../../src/language/base-executor.js';
import { serializeMachineToJSON } from '../../src/language/json/serializer.js';

/**
 * Convert a parsed Machine AST into the canonical MachineData structure.
 */
export function convertAstToMachineData(machine: Machine): MachineData {
    return serializeMachineToJSON(machine);
}

/**
 * Create a deep-cloned copy of MachineData for mutation-safe operations.
 */
export function cloneMachineData(machineData: MachineData): MachineData {
    return JSON.parse(JSON.stringify(machineData));
}
