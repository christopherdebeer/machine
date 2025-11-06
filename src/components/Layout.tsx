import React from 'react';

interface LayoutProps {
    children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div className="documentation-layout">
            <header className="doc-header">
                <div className="header-content">
                    <h1 className="logo">
                        <a href="/machine/">DyGram Documentation</a>
                    </h1>
                    <nav className="main-nav">
                        <a href="/machine/quick-start.html">Quick Start</a>
                        <a href="/machine/grammar-reference.html">Reference</a>
                        <a href="/machine/examples.html">Examples</a>
                        <a href="/machine/playground.html">Playground</a>
                    </nav>
                </div>
            </header>
            <main className="doc-content">
                {children}
            </main>
            <footer className="doc-footer">
                <p>© 2025 DyGram. Built with React + MDX.</p>
            </footer>
        </div>
    );
};
