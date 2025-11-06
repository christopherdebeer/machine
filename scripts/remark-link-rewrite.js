import { visit } from 'unist-util-visit';
import { basename, dirname, extname } from 'path';

/**
 * Remark plugin to rewrite markdown links to folder-based HTML URLs
 * Transforms:
 *   - [Text](path/to/file.md) -> [Text](file/)
 *   - [Text](./file.md) -> [Text](file/)
 *   - [Text](path/to/README.md) -> [Text](path/to/)
 *   - [Text](QuickStart.mdx) -> [Text](quick-start/)
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

            // Extract the path without extension
            const pathWithoutExt = url.substring(0, url.length - ext.length);

            // Extract filename without extension
            let filename = basename(url, ext);

            // Handle README.md links - point to the directory
            if (filename === 'README') {
                const linkDir = dirname(url);
                if (linkDir === '.' || linkDir === '') {
                    // Root README → ./
                    node.url = './';
                } else {
                    // Subdirectory README → directory/ (with trailing slash)
                    // Remove ./ prefix if present
                    const cleanDir = linkDir.replace(/^\.\//, '');
                    node.url = `${cleanDir}/`;
                }
                return;
            }

            // Convert PascalCase/camelCase to kebab-case
            const kebabName = filename
                .replace(/([A-Z])/g, '-$1')
                .toLowerCase()
                .replace(/^-/, '');

            // Get directory part if present
            const dir = dirname(url);
            if (dir && dir !== '.') {
                // Remove ./ prefix if present
                const cleanDir = dir.replace(/^\.\//, '');
                node.url = `${cleanDir}/${kebabName}/`;
            } else {
                node.url = `${kebabName}/`;
            }
        });
    };
}
