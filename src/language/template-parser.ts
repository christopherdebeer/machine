/**
 * Template String Parser
 *
 * Parses template strings containing {{ }} placeholders into structured parts.
 * This provides the internal structure needed for intelligent completion
 * without requiring complex lexer modes in the grammar.
 */

export interface TemplatePart {
    type: 'text' | 'placeholder';
    content: string;
    /** Start offset within the template string (excluding quotes) */
    start: number;
    /** End offset within the template string (excluding quotes) */
    end: number;
}

export interface TemplateStructure {
    /** Whether this string contains template markers */
    isTemplate: boolean;
    /** The raw string value (with quotes removed) */
    raw: string;
    /** Structured parts of the template */
    parts: TemplatePart[];
}

/**
 * Parse a string value into template structure
 * @param value - The string value (may include surrounding quotes)
 * @returns Structured template information
 */
export function parseTemplateString(value: string): TemplateStructure {
    // Remove surrounding quotes
    const cleaned = value.replace(/^["']|["']$/g, '');

    // Check if it contains template markers
    if (!cleaned.includes('{{')) {
        return {
            isTemplate: false,
            raw: cleaned,
            parts: [{
                type: 'text',
                content: cleaned,
                start: 0,
                end: cleaned.length
            }]
        };
    }

    const parts: TemplatePart[] = [];
    let currentPos = 0;
    const regex = /\{\{([^}]*)\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleaned)) !== null) {
        const matchStart = match.index;
        const matchEnd = regex.lastIndex;

        // Add text part before the placeholder (if any)
        if (matchStart > currentPos) {
            parts.push({
                type: 'text',
                content: cleaned.substring(currentPos, matchStart),
                start: currentPos,
                end: matchStart
            });
        }

        // Add placeholder part
        parts.push({
            type: 'placeholder',
            content: match[1].trim(), // The expression inside {{ }}
            start: matchStart,
            end: matchEnd
        });

        currentPos = matchEnd;
    }

    // Add remaining text after last placeholder (if any)
    if (currentPos < cleaned.length) {
        parts.push({
            type: 'text',
            content: cleaned.substring(currentPos),
            start: currentPos,
            end: cleaned.length
        });
    }

    return {
        isTemplate: true,
        raw: cleaned,
        parts
    };
}

/**
 * Find which template part contains a given offset
 * @param structure - The parsed template structure
 * @param offset - Offset within the string (excluding quotes)
 * @returns The template part at that offset, or undefined
 */
export function getPartAtOffset(structure: TemplateStructure, offset: number): TemplatePart | undefined {
    return structure.parts.find(part => offset >= part.start && offset < part.end);
}

/**
 * Check if an offset is inside a placeholder
 * @param structure - The parsed template structure
 * @param offset - Offset within the string (excluding quotes)
 * @returns True if the offset is inside a {{ }} placeholder
 */
export function isInsidePlaceholder(structure: TemplateStructure, offset: number): boolean {
    const part = getPartAtOffset(structure, offset);
    return part?.type === 'placeholder';
}

/**
 * Extract the expression text before the cursor in a placeholder
 * Useful for determining completion context (e.g., "node.attr" with cursor after "node.")
 * @param structure - The parsed template structure
 * @param offset - Offset within the string (excluding quotes)
 * @returns The expression text before cursor, or empty string
 */
export function getExpressionBeforeCursor(structure: TemplateStructure, offset: number): string {
    const part = getPartAtOffset(structure, offset);
    if (part?.type !== 'placeholder') {
        return '';
    }

    // Calculate offset within the placeholder content
    // part.start points to the {{ marker, so add 2 to skip it
    const relativeOffset = offset - part.start - 2;

    // Handle edge cases
    if (relativeOffset < 0) return '';
    if (relativeOffset > part.content.length) return part.content;

    return part.content.substring(0, relativeOffset);
}
