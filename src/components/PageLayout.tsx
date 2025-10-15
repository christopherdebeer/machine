import React, { useEffect } from 'react';
import { MetaTags } from './MetaTags';
import { Navigation } from './Navigation';
import { Footer } from './Footer';

// Import hierarchy data (will be generated at build time)
let hierarchyData: any[] = [];
try {
    hierarchyData = require('../data/doc-hierarchy.json');
} catch (error) {
    // Hierarchy file doesn't exist yet, use empty array
    console.warn('Doc hierarchy not found, using default footer');
}

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

            <Footer hierarchy={hierarchyData} />
        </div>
    );
};
