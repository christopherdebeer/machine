/**
 * Shared style normalization utilities.
 *
 * Provides helpers for converting user-facing CSS-like style keys into
 * Graphviz-compatible attribute names so serialization and visualization
 * code can share the same mapping logic.
 */

/**
 * Map CSS property names to Graphviz DOT property names.
 * Users can author styles with familiar CSS properties which will be
 * converted to their Graphviz equivalents.
 */
export function mapCssPropertyToGraphviz(cssProperty: string): string {
    const propertyMap: Record<string, string> = {
        'stroke-width': 'penwidth',
        'stroke': 'color',
        'fill': 'fillcolor',
        'font-family': 'fontname',
        'font-size': 'fontsize',
        'font-weight': 'fontweight',
        'text-align': 'labeljust',
        'background-color': 'fillcolor',
        'border-color': 'color',
        'border-width': 'penwidth',
        'opacity': 'alpha',
        'direction': 'rankdir'
    };

    const normalized = cssProperty.toLowerCase().trim();
    return propertyMap[normalized] || cssProperty.trim();
}

/**
 * Normalize a style key by trimming whitespace and mapping CSS-like names
 * to their Graphviz equivalents.
 */
export function normalizeStyleKey(key: string): string {
    return mapCssPropertyToGraphviz(key);
}
