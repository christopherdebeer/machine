import React, { useEffect } from 'react';
import { MetaTags } from './MetaTags.js'
import { Navigation } from './Navigation.js'
import { Footer } from './Footer.js'
import hierarchyData from '../data/doc-hierarchy.js'

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
