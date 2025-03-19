import { ValidationRegistry, type ValidationAcceptor, type ValidationChecks } from 'langium';
import type { MachineAstType, Machine, Node } from './generated/ast.js';
import type { MachineServices } from './machine-module.js';

/**
 * Registry for validation checks.
 */
export class MachineValidationRegistry extends ValidationRegistry {
    constructor(services: MachineServices) {
        super(services);
        const validator = services.validation.MachineValidator;
        const checks: ValidationChecks<MachineAstType> = {
            Machine: [
                validator.checkMachineStartsWithCapital.bind(validator),
                validator.checkDuplicateStates.bind(validator),
                validator.checkInvalidStateReferences.bind(validator),
            ],
        };
        this.register(checks, validator);
    }
}

/**
 * Implementation of custom validations.
 */
export class MachineValidator {

    checkMachineStartsWithCapital(machine: Machine, accept: ValidationAcceptor): void {
        if (!machine.title || machine.title.length === 0) {
            accept('error', 'Machine must have a title', { node: machine, property: 'title' });
        }
    }

    checkDuplicateStates(machine: Machine, accept: ValidationAcceptor): void {
        const stateNames = new Map<string, Node>();
        const processNode = (node: Node) => {
            if (stateNames.has(node.name)) {
                accept('error', `Duplicate state name: ${node.name}`, { node: node });
                accept('error', 'First declaration of state', { node: stateNames.get(node.name)! });
            } else {
                stateNames.set(node.name, node);
            }
            // Process nested nodes
            for (const childNode of node.nodes) {
                processNode(childNode);
            }
        };

        for (const node of machine.nodes) {
            processNode(node);
        }
    }

    checkInvalidStateReferences(machine: Machine, accept: ValidationAcceptor): void {
        const stateNames = new Set<string>();
        const collectStateNames = (node: Node) => {
            stateNames.add(node.name);
            for (const childNode of node.nodes) {
                collectStateNames(childNode);
            }
        };

        for (const node of machine.nodes) {
            collectStateNames(node);
        }

        for (const edge of machine.edges) {
            if (edge.source && !stateNames.has(edge.source.$refText)) {
                accept('error', `Reference to undefined state: ${edge.source.$refText}`, { node: edge, property: 'source' });
            }

            for (const segment of edge.segments) {
                if (!stateNames.has(segment.target.$refText)) {
                    accept('error', `Reference to undefined state: ${segment.target.$refText}`, { node: segment, property: 'target' });
                }
            }
        }
    }
}
