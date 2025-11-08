import type { MachineEdge } from '../base-executor.js';

function normalizeValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }

    if (Array.isArray(value)) {
        return value.map(normalizeValue).filter(Boolean).join(', ');
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    return String(value);
}

/**
 * Get the structured metadata object for an edge.
 * Prefers the canonical `value` map and falls back to legacy `attributes` payloads.
 */
export function getEdgeValue(edge: MachineEdge): Record<string, any> | undefined {
    if (edge.value && typeof edge.value === 'object') {
        return edge.value;
    }
    if (edge.attributes && typeof edge.attributes === 'object') {
        return edge.attributes;
    }
    return undefined;
}

/**
 * Return the primary text associated with an edge for display/logging purposes.
 */
export function getEdgeText(edge: MachineEdge): string | undefined {
    const metadata = getEdgeValue(edge);

    if (metadata) {
        if (typeof metadata.text === 'string' && metadata.text.trim().length > 0) {
            return metadata.text.trim();
        }

        const entries = Object.entries(metadata)
            .filter(([key, value]) => key !== 'text' && value !== undefined && value !== null)
            .map(([key, value]) => `${key}=${normalizeValue(value)}`);

        if (entries.length > 0) {
            return entries.join(', ');
        }
    }

    // Fall back to legacy label/type if present
    if (edge.label && edge.label.trim().length > 0) {
        return edge.label.trim();
    }
    if (edge.type && edge.type.trim().length > 0) {
        return edge.type.trim();
    }

    return undefined;
}

/**
 * Build a lower-cased search string representing an edge.
 */
export function getEdgeSearchText(edge: MachineEdge): string {
    const parts: string[] = [];

    const text = getEdgeText(edge);
    if (text) parts.push(text);

    const metadata = getEdgeValue(edge);
    if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
            parts.push(`${key}:${normalizeValue(value)}`);
        }
    }

    if (edge.arrowType) parts.push(edge.arrowType);
    if (edge.annotations) {
        for (const annotation of edge.annotations) {
            parts.push(`@${annotation.name}`);
            if (annotation.value !== undefined) {
                parts.push(normalizeValue(annotation.value));
            }
        }
    }

    if (edge.label) parts.push(edge.label);
    if (edge.type) parts.push(edge.type);

    return parts
        .map(part => part.toLowerCase())
        .join(' ')
        .trim();
}

/**
 * Check whether an edge contains a specific annotation.
 */
export function edgeHasAnnotation(edge: MachineEdge, name: string): boolean {
    if (edge.annotations?.some(annotation => annotation.name === name)) {
        return true;
    }

    // Fallback: look for annotation tokens in text metadata
    const search = getEdgeSearchText(edge);
    return search.includes(`@${name.toLowerCase()}`);
}
