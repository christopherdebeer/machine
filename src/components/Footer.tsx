import React from 'react';

interface DocItem {
    type: 'file' | 'directory';
    name: string;
    title: string;
    url?: string;
    indexUrl?: string;
    children?: DocItem[];
}

interface FooterProps {
    hierarchy?: DocItem[];
}

export const Footer: React.FC<FooterProps> = ({ hierarchy = [] }) => {
    // Group items for footer columns
    const getFooterSections = () => {
        // Default fallback if hierarchy is not provided
        if (hierarchy.length === 0) {
            return {
                documentation: [
                    { title: 'Quick Start', url: 'quick-start.html' },
                    { title: 'Grammar Reference', url: 'grammar-reference.html' },
                    { title: 'Examples', url: 'examples.html' },
                    { title: 'Integration', url: 'integration.html' },
                ],
                resources: [
                    { title: 'GitHub', url: 'https://github.com/christopherdebeer/machine', external: true },
                    { title: 'VS Code Extension', url: 'vscode-extension.html' },
                    { title: 'Evolution System', url: 'evolution.html' },
                    { title: 'API', url: 'api.html' },
                ],
                community: [
                    { title: 'GitHub Discussions', url: 'https://github.com/christopherdebeer/machine/discussions', external: true },
                    { title: 'Blog', url: 'blog.html' },
                    { title: 'Events', url: 'events.html' },
                ]
            };
        }

        // Build sections from hierarchy
        const documentation: any[] = [];
        const resources: any[] = [];
        const community: any[] = [];

        for (const item of hierarchy) {
            if (item.type === 'directory') {
                const section = {
                    title: item.title,
                    url: item.indexUrl || '#'
                };

                // Categorize sections
                const name = item.name.toLowerCase();
                if (name === 'getting-started' || name === 'guides' || name === 'reference') {
                    documentation.push(section);
                } else if (name === 'integration' || name === 'architecture' || name === 'examples') {
                    documentation.push(section);
                } else if (name === 'resources') {
                    resources.push(section);
                }
            } else if (item.type === 'file') {
                const file = {
                    title: item.title,
                    url: item.url || '#'
                };

                // Categorize files
                const title = item.title.toLowerCase();
                if (title.includes('api') || title.includes('quick start')) {
                    documentation.push(file);
                }
            }
        }

        // Add external links
        resources.push(
            { title: 'GitHub', url: 'https://github.com/christopherdebeer/machine', external: true }
        );
        resources.push(
            { title: 'Test artifacts', url: '/test-output/index.html', external: false }
        );
        community.push(
            { title: 'GitHub Discussions', url: 'https://github.com/christopherdebeer/machine/discussions', external: true }
        );

        return { documentation, resources, community };
    };

    const sections = getFooterSections();

    return (
        <footer>
            <div className="container">
                <div className="footer-grid">
                    {sections.documentation.length > 0 && (
                        <div className="footer-links">
                            <h3>DOCUMENTATION</h3>
                            <ul>
                                {sections.documentation.slice(0, 6).map((item, idx) => (
                                    <li key={idx}>
                                        <a href={item.url} {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                            {item.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {sections.resources.length > 0 && (
                        <div className="footer-links">
                            <h3>RESOURCES</h3>
                            <ul>
                                {sections.resources.slice(0, 6).map((item, idx) => (
                                    <li key={idx}>
                                        <a href={item.url} {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                            {item.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {sections.community.length > 0 && (
                        <div className="footer-links">
                            <h3>COMMUNITY</h3>
                            <ul>
                                {sections.community.slice(0, 6).map((item, idx) => (
                                    <li key={idx}>
                                        <a href={item.url} {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                            {item.title}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                <div className="copyright">
                    &copy; 2025 DyGram. All rights reserved.
                </div>
            </div>
        </footer>
    );
};
