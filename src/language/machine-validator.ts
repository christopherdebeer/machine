import type { ValidationAcceptor, ValidationChecks } from 'langium';
import type { MachineAstType, Machine } from './generated/ast.js';
import type { MachineServices } from './machine-module.js';

/**
 * Register custom validation checks.
 */
export function registerValidationChecks(services: MachineServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.MachineValidator;
    const checks: ValidationChecks<MachineAstType> = {
        Machine: validator.checkMachineStartsWithCapital
    };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class MachineValidator {

    checkMachineStartsWithCapital(machine: Machine, accept: ValidationAcceptor): void {
        if (!machine.title) {
                accept('warning', 'Machine should have a non empty title', { node: machine, property: 'title' });
        }
    }

}
