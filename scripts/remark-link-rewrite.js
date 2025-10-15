import { visit } from 'unist-util-visit';
import { basename, dirname, extname } from 'path';

/**
 * Remark plugin to rewrite markdown links to HTML links
 * Transforms:
 *   - [Text](path/to/file.md) -> [Text](file.html)
 *   - [Text](path/to/README.md) -> [Text](dirname-index.html)
 *   - [Text](QuickStart.mdx) -> [Text](quick-start.html)
 */
export default function remarkLinkRewrite() {
    return (tree) => {
        visit(tree, 'link', (node) => {
            const url = node.url;

            // Skip external links (http://, https://, mailto:, etc.)
            if (/^[a-z]+:/i.test(url)) {
                return;
            }

            // Skip anchors
            if (url.startsWith('#')) {
                return;
            }

            // Only process .md and .mdx links
            const ext = extname(url);
            if (ext !== '.md' && ext !== '.mdx') {
                return;
            }

            // Extract filename without extension
            let filename = basename(url, ext);

            // Handle README.md links
            if (filename === 'README') {
                const linkDir = dirname(url);
                if (linkDir === '.' || linkDir === '') {
                    // Root README → documentation.html
                    node.url = 'documentation.html';
                } else {
                    // Subdirectory README → {dirname}-index.html
                    const dirName = basename(linkDir);
                    node.url = `${dirName}-index.html`;
                }
                return;
            }

            // Convert PascalCase/camelCase to kebab-case
            const kebabName = filename
                .replace(/([A-Z])/g, '-$1')
                .toLowerCase()
                .replace(/^-/, '');

            node.url = `${kebabName}.html`;
        });
    };
}
