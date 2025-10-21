import { visit } from 'unist-util-visit';

/**
 * Remark plugin to automatically generate table of contents
 * Collects all headings and injects TOC after the first heading
 */
export default function remarkTOC(options = {}) {
    const {
        maxDepth = 3,
        minEntries = 2,
        heading = 'Table of Contents',
        tight = true
    } = options;

    return (tree) => {
        const headings = [];
        let firstHeadingIndex = -1;

        // First pass: collect all headings
        visit(tree, 'heading', (node, index) => {
            if (node.depth <= maxDepth && node.depth > 1) {
                // Extract text from heading
                const text = node.children
                    .filter(child => child.type === 'text' || child.type === 'inlineCode')
                    .map(child => child.value)
                    .join('');

                // Generate slug from text
                const slug = text
                    .toLowerCase()
                    .replace(/[^\w\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/^-+|-+$/g, '');

                headings.push({
                    depth: node.depth,
                    text,
                    slug
                });
            }

            // Track first heading (likely h1)
            if (firstHeadingIndex === -1 && node.depth === 1) {
                firstHeadingIndex = index;
            }
        });

        // Only generate TOC if we have enough headings
        if (headings.length < minEntries || firstHeadingIndex === -1) {
            return;
        }

        // Build TOC structure
        const tocItems = headings.map(h => ({
            type: 'listItem',
            spread: !tight,
            children: [
                {
                    type: 'paragraph',
                    children: [
                        {
                            type: 'link',
                            url: `#${h.slug}`,
                            children: [{ type: 'text', value: h.text }]
                        }
                    ]
                },
                // Add nested list for sub-headings
                ...(h.depth > 2 ? [] : [])
            ]
        }));

        // Create nested structure based on depth
        const tocList = {
            type: 'list',
            ordered: false,
            spread: !tight,
            children: tocItems
        };

        // Create TOC section
        const tocSection = [
            {
                type: 'heading',
                depth: 2,
                children: [{ type: 'text', value: heading }]
            },
            tocList,
            {
                type: 'thematicBreak'
            }
        ];

        // Insert TOC after first heading
        tree.children.splice(firstHeadingIndex + 1, 0, ...tocSection);
    };
}
