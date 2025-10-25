import type { Machine, Node } from '../generated/ast.js';

export interface ResolvedReference {
    node?: Node;
    attribute?: string;
}

const QUALIFIED_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function sanitizeQualified(value: string): string {
    return value.replace(/^["']|["']$/g, '').trim();
}

export function splitQualifiedPath(value: string | undefined): string[] {
    if (!value) {
        return [];
    }

    const sanitized = sanitizeQualified(value);
    if (!sanitized) {
        return [];
    }

    return sanitized.split('.').map(segment => segment.trim()).filter(Boolean);
}

export function isPotentialQualifiedReference(value: string | undefined): boolean {
    if (!value) {
        return false;
    }

    const sanitized = sanitizeQualified(value);
    if (!sanitized) {
        return false;
    }

    return QUALIFIED_IDENTIFIER_PATTERN.test(sanitized);
}

export function resolveQualifiedPath(machine: Machine, qualified: string | undefined): ResolvedReference {
    if (!qualified) {
        return { node: undefined, attribute: undefined };
    }

    const segments = splitQualifiedPath(qualified);
    if (segments.length === 0) {
        return { node: undefined, attribute: undefined };
    }

    let current: Node | undefined;
    let children: Node[] = machine.nodes;

    for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];
        const next = children.find(child => child.name === segment);

        if (next) {
            current = next;
            children = next.nodes ?? [];
            continue;
        }

        if (current && index === segments.length - 1) {
            const hasAttribute = current.attributes?.some(attr => attr.name === segment);
            if (hasAttribute) {
                return { node: current, attribute: segment };
            }
        }

        current = undefined;
        break;
    }

    if (current) {
        return { node: current, attribute: undefined };
    }

    if (segments.length >= 2) {
        const attributeName = segments[segments.length - 1];
        const nodeSegments = segments.slice(0, -1);

        const resolvedNode = findNodeBySegments(machine, nodeSegments)
            ?? findNodeByName(machine.nodes, nodeSegments[nodeSegments.length - 1]);

        if (resolvedNode && resolvedNode.attributes?.some(attr => attr.name === attributeName)) {
            return { node: resolvedNode, attribute: attributeName };
        }
    }

    if (segments.length === 1) {
        const node = findNodeByName(machine.nodes, segments[0]);
        if (node) {
            return { node, attribute: undefined };
        }
    }

    return { node: undefined, attribute: undefined };
}

function findNodeByName(nodes: Node[], name: string | undefined): Node | undefined {
    if (!name) {
        return undefined;
    }

    for (const node of nodes) {
        if (node.name === name) {
            return node;
        }

        const child = findNodeByName(node.nodes ?? [], name);
        if (child) {
            return child;
        }
    }

    return undefined;
}

export function findNodeBySegments(machine: Machine, segments: string[]): Node | undefined {
    if (segments.length === 0) {
        return undefined;
    }

    let current: Node | undefined;
    let children: Node[] = machine.nodes;

    for (const segment of segments) {
        const next = children.find(child => child.name === segment);
        if (!next) {
            return undefined;
        }
        current = next;
        children = next.nodes ?? [];
    }

    return current;
}
