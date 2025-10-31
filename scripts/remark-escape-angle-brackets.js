import { visit } from 'unist-util-visit';

/**
 * Remark plugin to escape angle brackets in text and heading content
 * to prevent MDX from interpreting them as JSX tags.
 *
 * Specifically handles cases like:
 * - ### Array\<T\>
 * - ### Map\<K, V\>
 * - text containing <Type> references
 *
 * The plugin converts these to HTML entities to prevent MDX parsing issues.
 */
export default function remarkEscapeAngleBrackets() {
    return (tree) => {
        visit(tree, ['text', 'heading'], (node) => {
            // For heading nodes, process the children
            if (node.type === 'heading' && node.children) {
                node.children.forEach(child => {
                    if (child.type === 'text' && child.value) {
                        // Replace angle brackets with HTML entities
                        child.value = child.value
                            .replace(/\\</g, '&lt;')  // \< becomes &lt;
                            .replace(/\\>/g, '&gt;'); // \> becomes &gt;
                    }
                });
            }

            // For text nodes, escape angle brackets
            if (node.type === 'text' && node.value) {
                // Replace escaped angle brackets with HTML entities
                node.value = node.value
                    .replace(/\\</g, '&lt;')  // \< becomes &lt;
                    .replace(/\\>/g, '&gt;'); // \> becomes &gt;
            }
        });
    };
}
