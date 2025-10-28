import { ValidationRegistry, type ValidationAcceptor, type ValidationChecks } from 'langium';
import type { MachineAstType, Machine, Node, EdgeSegment, Attribute } from './generated/ast.js';
import type { MachineServices } from './machine-module.js';
import { TypeChecker } from './type-checker.js';
import { GraphValidator } from './graph-validator.js';
import { DependencyAnalyzer } from './dependency-analyzer.js';
import { extractValueFromAST } from './utils/ast-helpers.js';

/**
 * Registry for validation checks.
 */
export class MachineValidationRegistry extends ValidationRegistry {
    constructor(services: MachineServices) {
        super(services);
        const validator = services.validation.MachineValidator;
        const checks: ValidationChecks<MachineAstType> = {
            Machine: [
                // validator.checkMachineStartsWithCapital.bind(validator),
                validator.checkDuplicateStates.bind(validator),
                validator.checkReservedNodeNames.bind(validator),
                validator.checkInvalidStateReferences.bind(validator),
                // Validation: Graph validation
                validator.checkGraphStructure.bind(validator),
                // Validation: Semantic validation
                validator.checkNodeTypeSemantics.bind(validator),
                validator.checkRelationshipSemantics.bind(validator),
                // Context access validation
                validator.checkContextAccess.bind(validator),
            ],
            EdgeSegment: [
                validator.checkMultiplicityFormat.bind(validator),
            ],
            Node: [
                // Validation: Semantic validation
                validator.checkNodeAnnotationCompatibility.bind(validator),
            ],
            Attribute: [
                // Validation: Type checking
                validator.checkAttributeTypeCompatibility.bind(validator),
                validator.checkGenericTypeValidity.bind(validator),
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
        // if (!machine.title || machine.title.length === 0) {
        //     accept('error', 'Machine must have a title', { node: machine, property: 'title' });
        // }
    }

    checkDuplicateStates(machine: Machine, accept: ValidationAcceptor): void {
        const stateNames = new Map<string, Node>();
        const processNode = (node: Node) => {
            // Skip note nodes entirely - they reference other nodes but aren't duplicates
            if (node.type?.toLowerCase() !== 'note') {
                if (stateNames.has(node.name)) {
                    accept('error', `Duplicate state name: ${node.name}`, { node: node });
                    accept('error', `First declaration of duplicate state ${node.name}`, { node: stateNames.get(node.name)! });
                } else {
                    stateNames.set(node.name, node);
                }
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

    /**
     * Check for nodes using reserved CEL variable names
     * Reserved names: errorCount, errors, activeState
     */
    checkReservedNodeNames(machine: Machine, accept: ValidationAcceptor): void {
        const RESERVED_NAMES = ['errorCount', 'errors', 'activeState'];

        const processNode = (node: Node) => {
            if (RESERVED_NAMES.includes(node.name)) {
                accept('warning',
                    `Node name '${node.name}' is reserved for built-in CEL variables. ` +
                    `Built-in variable will take precedence. Consider renaming the node.`,
                    { node: node, property: 'name' }
                );
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
        // Check if @StrictMode annotation is present
        const isStrictMode = machine.annotations?.some(ann => ann.name === 'StrictMode') ?? false;

        // In non-strict mode, skip validation since linker will auto-create missing nodes
        if (!isStrictMode) {
            return;
        }

        // Collect all explicitly defined node names (excluding notes)
        const stateNames = new Set<string>();
        const collectStateNames = (node: Node) => {
            // Don't add note nodes themselves to the state names set
            if (node.type?.toLowerCase() !== 'note') {
                stateNames.add(node.name);
            }
            for (const childNode of node.nodes) {
                collectStateNames(childNode);
            }
        };

        for (const node of machine.nodes) {
            collectStateNames(node);
        }

        // Check all edge references (only in strict mode)
        for (const edge of machine.edges) {
            edge.source.forEach(source => {
                if (!stateNames.has(source.$refText)) {
                    accept('error', `Reference to undefined state: ${source.$refText}`, { node: edge, property: 'source' });
                }
            })

            for (const segment of edge.segments) {
                segment.target.forEach(target => {
                    if (!stateNames.has(target.$refText)) {
                        accept('error', `Reference to undefined state: ${target.$refText}`, { node: segment, property: 'target' });
                    }
                })
            }
        }

        // Check all note target references (only in strict mode)
        // Notes are now regular nodes with type="note" where the node name is the target
        const validateNoteTargets = (nodes: Node[]) => {
            nodes.forEach(node => {
                if (node.type?.toLowerCase() === 'note') {
                    // The node name is the target
                    const targetValue = node.name;
                    if (targetValue && !stateNames.has(targetValue)) {
                        accept('error', `Note references undefined node: ${targetValue}`, { node, property: 'name' });
                    }
                }
                // Recursively check child nodes
                if (node.nodes && node.nodes.length > 0) {
                    validateNoteTargets(node.nodes);
                }
            });
        };

        validateNoteTargets(machine.nodes);
    }

    /**
     * Validate multiplicity format
     * Valid formats: "1", "*", "0..1", "1..*", "0..*", "2..5", etc.
     */
    checkMultiplicityFormat(segment: EdgeSegment, accept: ValidationAcceptor): void {
        const validateMultiplicity = (mult: string | undefined, label: string) => {
            if (!mult) return;

            // Remove quotes
            const value = mult.replace(/^"|"$/g, '');

            // Valid patterns: single number, *, or range (n..m where n and m are numbers or *)
            const pattern = /^([0-9]+|\*)(\.\.[0-9*]+)?$/;

            if (!pattern.test(value)) {
                accept('error',
                    `Invalid ${label} multiplicity format: "${value}". Expected format: "1", "*", "0..1", "1..*", etc.`,
                    { node: segment, property: label === 'source' ? 'sourceMultiplicity' : 'targetMultiplicity' }
                );
                return;
            }

            // Additional validation for ranges
            if (value.includes('..')) {
                const [lower, upper] = value.split('..');

                // If both are numbers, lower should be <= upper
                if (lower !== '*' && upper !== '*') {
                    const lowerNum = parseInt(lower);
                    const upperNum = parseInt(upper);

                    if (lowerNum > upperNum) {
                        accept('warning',
                            `${label} multiplicity range "${value}" has lower bound greater than upper bound`,
                            { node: segment, property: label === 'source' ? 'sourceMultiplicity' : 'targetMultiplicity' }
                        );
                    }
                }
            }
        };

        validateMultiplicity(segment.sourceMultiplicity, 'source');
        validateMultiplicity(segment.targetMultiplicity, 'target');
    }

    // ========== Validation: Type Checking ==========

    /**
     * Type Checking: Check attribute type compatibility
     */
    checkAttributeTypeCompatibility(attr: Attribute, accept: ValidationAcceptor): void {
        if (!attr.type) return;

        // Get the machine from the attribute's container
        const machine = this.getMachineFromAttribute(attr);
        if (!machine) return;

        const typeChecker = new TypeChecker(machine);
        const result = typeChecker.validateAttributeType(attr);

        if (!result.valid && result.message) {
            // Determine the appropriate property to highlight
            const property = attr.value ? 'value' : 'type';
            accept('error', result.message, { node: attr, property });
        }
    }

    /**
     * Type Checking: Validate generic type syntax
     */
    checkGenericTypeValidity(attr: Attribute, accept: ValidationAcceptor): void {
        if (!attr.type) return;

        // Get the machine from the attribute's container
        const machine = this.getMachineFromAttribute(attr);
        if (!machine) return;

        const typeChecker = new TypeChecker(machine);

        // Convert TypeDef to string for validation
        const typeStr = this.typeDefToString(attr.type);
        const result = typeChecker.validateGenericType(typeStr);

        if (!result.valid && result.message) {
            accept('error', result.message, { node: attr, property: 'type' });
        }
    }

    /**
     * Helper to convert TypeDef to string
     */
    private typeDefToString(typeDef: any): string {
        if (typeof typeDef === 'string') {
            return typeDef;
        }

        if (!typeDef || !typeDef.base) {
            return 'any';
        }

        let result = typeDef.base;

        if (typeDef.generics && typeDef.generics.length > 0) {
            const genericStrs = typeDef.generics.map((g: any) => this.typeDefToString(g));
            result += '<' + genericStrs.join(', ') + '>';
        }

        return result;
    }

    /**
     * Helper to get Machine from Attribute
     */
    private getMachineFromAttribute(attr: Attribute): Machine | null {
        let current: any = attr.$container;

        while (current) {
            if (current.$type === 'Machine') {
                return current as Machine;
            }
            current = current.$container;
        }

        return null;
    }

    // ========== Validation: Graph Validation ==========

    /**
     * Graph Validation: Validate graph structure
     */
    checkGraphStructure(machine: Machine, accept: ValidationAcceptor): void {
        const graphValidator = new GraphValidator(machine);
        const result = graphValidator.validate();

        // Report unreachable nodes
        if (result.unreachableNodes && result.unreachableNodes.length > 0) {
            accept('warning',
                `Unreachable nodes detected: ${result.unreachableNodes.join(', ')}. These nodes cannot be reached from entry points.`,
                { node: machine, property: 'nodes' }
            );
        }

        // Report orphaned nodes
        if (result.orphanedNodes && result.orphanedNodes.length > 0) {
            accept('warning',
                `Orphaned nodes detected: ${result.orphanedNodes.join(', ')}. These nodes have no incoming or outgoing edges.`,
                { node: machine, property: 'nodes' }
            );
        }

        // Report cycles
        if (result.cycles && result.cycles.length > 0) {
            result.cycles.forEach((cycle, index) => {
                accept('warning',
                    `Cycle ${index + 1} detected: ${cycle.join(' → ')}. This may lead to infinite loops.`,
                    { node: machine, property: 'edges' }
                );
            });
        }

        // Report missing entry points
        if (result.missingEntryPoints) {
            accept('warning',
                'No entry points found. Consider adding an init node or a node with no incoming edges.',
                { node: machine, property: 'nodes' }
            );
        }
    }

    // ========== Validation: Semantic Validation ==========

    /**
     * Semantic Validation: Validate node type semantics
     */
    checkNodeTypeSemantics(machine: Machine, accept: ValidationAcceptor): void {
        const processNode = (node: Node) => {
            // Normalize type for comparison
            const nodeType = node.type?.toLowerCase();

            // Rule 1: init nodes should have outgoing edges
            if (nodeType === 'init') {
                const hasOutgoingEdges = machine.edges.some(edge =>
                    edge.source.some(s => s.$refText === node.name || s.ref?.name === node.name)
                );

                if (!hasOutgoingEdges) {
                    accept('warning',
                        `Init node '${node.name}' has no outgoing edges. Init nodes should transition to other nodes.`,
                        { node, property: 'type' }
                    );
                }
            }

            // Rule 2: context nodes shouldn't have incoming edges (they're configuration)
            if (nodeType === 'context') {
                const hasIncomingEdges = machine.edges.some(edge =>
                    edge.segments.some(segment =>
                        segment.target.some(t => t.$refText === node.name || t.ref?.name === node.name)
                    )
                );

                if (hasIncomingEdges) {
                    accept('warning',
                        `Context node '${node.name}' has incoming edges. Context nodes typically represent configuration and should not be targets of edges.`,
                        { node, property: 'type' }
                    );
                }
            }

            // Recursively check child nodes
            node.nodes.forEach(child => processNode(child));
        };

        machine.nodes.forEach(node => processNode(node));
    }

    /**
     * Semantic Validation: Validate relationship semantics
     */
    checkRelationshipSemantics(machine: Machine, accept: ValidationAcceptor): void {
        // Build node type map
        const nodeTypes = new Map<string, string>();
        const collectNodeTypes = (node: Node) => {
            nodeTypes.set(node.name, node.type || 'task');
            node.nodes.forEach(child => collectNodeTypes(child));
        };
        machine.nodes.forEach(node => collectNodeTypes(node));

        // Validate edges based on arrow types
        machine.edges.forEach(edge => {
            edge.segments.forEach(segment => {
                // Get arrow type from segment
                const arrowType = this.getArrowTypeFromSegment(segment);

                if (arrowType === '<|--') {
                    // Inheritance relationship
                    // Both source and target should be the same type or compatible types
                    edge.source.forEach(source => {
                        segment.target.forEach(target => {
                            const sourceName = source.$refText || source.ref?.name;
                            const targetName = target.$refText || target.ref?.name;

                            if (!sourceName || !targetName) return;

                            const sourceType = nodeTypes.get(sourceName);
                            const targetType = nodeTypes.get(targetName);

                            // Inheritance should typically be between same types
                            if (sourceType && targetType && sourceType !== targetType) {
                                accept('warning',
                                    `Inheritance relationship from '${sourceName}' (${sourceType}) to '${targetName}' (${targetType}). Inheritance typically occurs between nodes of the same type.`,
                                    { node: segment, property: 'target' }
                                );
                            }
                        });
                    });
                }
            });
        });
    }

    /**
     * Semantic Validation: Check annotation compatibility with node types
     */
    checkNodeAnnotationCompatibility(node: Node, accept: ValidationAcceptor): void {
        if (!node.annotations || node.annotations.length === 0) return;

        node.annotations.forEach(annotation => {
            const annotationName = annotation.name;
            // Normalize type for comparison
            const nodeType = node.type?.toLowerCase();

            // @Async annotation should only be on task nodes
            if (annotationName === 'Async' && nodeType !== 'task') {
                accept('warning',
                    `@Async annotation is typically used only on task nodes, but '${node.name}' is of type '${node.type || 'untyped'}'.`,
                    { node: annotation, property: 'name' }
                );
            }

            // @Singleton annotation makes sense for context or service nodes
            // Skip warning for untyped nodes (undefined type)
            if (annotationName === 'Singleton' && nodeType === 'state') {
                accept('warning',
                    `@Singleton annotation on state node '${node.name}' may not be meaningful. Consider using it on task or context nodes.`,
                    { node: annotation, property: 'name' }
                );
            }

            // @Abstract annotation with init nodes doesn't make sense
            if (annotationName === 'Abstract' && nodeType === 'init') {
                accept('error',
                    `@Abstract annotation cannot be used on init node '${node.name}'. Init nodes are concrete entry points.`,
                    { node: annotation, property: 'name' }
                );
            }
        });
    }

    /**
     * Check for missing explicit context access edges
     * Warns when a task node references a context node in templates but has no explicit edge
     */
    checkContextAccess(machine: Machine, accept: ValidationAcceptor): void {
        const analyzer = new DependencyAnalyzer(machine);
        const inferredDeps = analyzer.inferDependencies();

        // Helper to check if a node is a context node
        const isContextNode = (nodeName: string): boolean => {
            const node = this.findNodeByName(machine, nodeName);
            if (!node) return false;
            return node.type?.toLowerCase() === 'context' ||
                   nodeName.toLowerCase().includes('context') ||
                   nodeName.toLowerCase().includes('output') ||
                   nodeName.toLowerCase().includes('input') ||
                   nodeName.toLowerCase().includes('data') ||
                   nodeName.toLowerCase().includes('result');
        };

        // Helper to check if a node is a task node
        const isTaskNode = (nodeName: string): boolean => {
            const node = this.findNodeByName(machine, nodeName);
            if (!node) return false;
            return node.type?.toLowerCase() === 'task' ||
                   node.attributes?.some(attr => attr.name === 'prompt');
        };

        // Check each inferred dependency
        for (const dep of inferredDeps) {
            // Only check task -> context dependencies
            if (!isTaskNode(dep.source) || !isContextNode(dep.target)) {
                continue;
            }

            // Check if there's an explicit edge from task to context or vice versa
            const hasExplicitEdge = machine.edges.some(edge => {
                return edge.segments.some(segment => {
                    // Get source names (edge.source is an array of references)
                    const sourceNames = edge.source.map(s => s.$refText || s.ref?.name);
                    const targetNames = segment.target.map(t => t.$refText || t.ref?.name);

                    // Check outbound: task -> context
                    if (sourceNames.includes(dep.source) && targetNames.includes(dep.target)) {
                        return true;
                    }

                    // Check inbound: context -> task
                    if (sourceNames.includes(dep.target) && targetNames.includes(dep.source)) {
                        return true;
                    }

                    return false;
                });
            });

            if (!hasExplicitEdge) {
                const sourceNode = this.findNodeByName(machine, dep.source);
                if (sourceNode) {
                    accept('warning',
                        `Task '${dep.source}' references context '${dep.target}' (${dep.reason}) but has no explicit edge. ` +
                        `Add: ${dep.source} -reads-> ${dep.target}; or ${dep.source} -stores-> ${dep.target};`,
                        { node: sourceNode, property: 'name' }
                    );
                }
            }
        }
    }

    /**
     * Helper to find a node by name
     */
    private findNodeByName(machine: Machine, name: string): Node | undefined {
        const findInNodes = (nodes: Node[]): Node | undefined => {
            for (const node of nodes) {
                if (node.name === name) return node;
                const found = findInNodes(node.nodes);
                if (found) return found;
            }
            return undefined;
        };
        return findInNodes(machine.nodes);
    }

    /**
     * Helper to get arrow type from edge segment
     */
    private getArrowTypeFromSegment(segment: EdgeSegment): string {
        // Try to get arrow type from the segment's CST node
        const cstNode = segment.$cstNode;
        if (cstNode) {
            const text = cstNode.text;

            // Check for different arrow types
            if (text.includes('<|--')) return '<|--';
            if (text.includes('*-->')) return '*-->';
            if (text.includes('o-->')) return 'o-->';
            if (text.includes('<-->')) return '<-->';
            if (text.includes('-->')) return '-->';
            if (text.includes('..>')) return '..>';
            if (text.includes('=>')) return '=>';
            if (text.includes('->')) return '->';
        }

        return '->';  // Default to association
    }
}
