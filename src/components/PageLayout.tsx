import React, { useEffect } from 'react';
import { MetaTags } from './MetaTags';
import { Navigation } from './Navigation';

interface PageLayoutProps {
    children: React.ReactNode;
    title: string;
    backLink?: boolean;
    description?: string;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ children, title, backLink = false, description }) => {
    useEffect(() => {
        // Add favicon if not present
        let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (!favicon) {
            favicon = document.createElement('link');
            favicon.setAttribute('rel', 'icon');
            favicon.setAttribute('type', 'image/jpeg');
            favicon.href = '/machine/icon.jpg';
            document.head.appendChild(favicon);
        }
    }, []);

    return (
        <div>
            <a href="#main-content" className="skip-link">
                Skip to main content
            </a>
            <MetaTags
                title={`${title} | DyGram`}
                description={description}
                url={`https://christopherdebeer.github.io/machine/${title.toLowerCase().replace(/\s+/g, '-')}.html`}
            />
            <Navigation />
            <header>
                <div className="container">
                    {backLink && (
                        <a href="index.html" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '1.2rem' }}>
                            ← Back to Home
                        </a>
                    )}
                    <div className="title-block" style={{ marginTop: backLink ? '2rem' : '0' }}>
                        {title}<span className="accent">.</span>
                    </div>
                </div>
            </header>

            <main id="main-content">
                <section>
                    <div className="container">
                        {children}
                    </div>
                </section>
            </main>

            <footer>
                <div className="container">
                    <div className="footer-grid">
                        <div className="footer-links">
                            <h3>DOCUMENTATION</h3>
                            <ul>
                                <li><a href="documentation.html">Documentation</a></li>
                                <li><a href="quick-start.html">Quick Start</a></li>
                                <li><a href="grammar-reference.html">Grammar Reference</a></li>
                                <li><a href="examples.html">Examples</a></li>
                                <li><a href="integration.html">Integration</a></li>
                            </ul>
                        </div>
                        <div className="footer-links">
                            <h3>RESOURCES</h3>
                            <ul>
                                <li><a href="https://github.com/christopherdebeer/machine" target="_blank">GitHub</a></li>
                                <li><a href="vscode-extension.html">VS Code Extension</a></li>
                                <li><a href="evolution.html">Evolution System</a></li>
                                <li><a href="api.html">API</a></li>
                                <li><a href="libraries.html">Libraries</a></li>
                            </ul>
                        </div>
                        <div className="footer-links">
                            <h3>COMMUNITY</h3>
                            <ul>
                                <li><a href="https://github.com/christopherdebeer/machine/discussions">GitHub Discussions</a></li>
                                <li><a href="blog.html">Blog</a></li>
                                <li><a href="events.html">Events</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="copyright">
                        &copy; 2025 DyGram. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};
