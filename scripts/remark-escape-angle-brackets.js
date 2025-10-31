import { visit } from 'unist-util-visit';

/**
 * Remark plugin to escape angle brackets in text and heading content
 * to prevent MDX from interpreting them as JSX tags.
 *
 * This plugin must run BEFORE MDX processes the markdown. The issue is:
 * 1. Markdown has: ### Map\<K, V\>
 * 2. Markdown parser interprets \< as just < (standard markdown escape)
 * 3. MDX then sees: ### Map<K, V>
 * 4. MDX tries to parse <K, V> as JSX and fails on the comma
 *
 * Solution: We convert the already-unescaped < and > to HTML entities
 * so MDX doesn't try to parse them as JSX.
 */
export default function remarkEscapeAngleBrackets() {
    return (tree) => {
        visit(tree, (node) => {
            // Process text nodes (including those inside headings)
            if (node.type === 'text' && node.value) {
                // At this point, markdown has already processed \< to <
                // So we need to convert < and > to HTML entities
                node.value = node.value
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }

            // Also handle inlineCode nodes if they contain angle brackets
            if (node.type === 'inlineCode' && node.value) {
                node.value = node.value
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;');
            }
        });
    };
}
