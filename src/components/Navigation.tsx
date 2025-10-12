import React, { useState, useEffect } from 'react';

export const Navigation: React.FC = () => {
    const [isScrolled, setIsScrolled] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navStyle: React.CSSProperties = {
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: isScrolled ? 'rgba(22, 22, 26, 0.95)' : 'var(--primary)',
        backdropFilter: isScrolled ? 'blur(10px)' : 'none',
        borderBottom: isScrolled ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
        transition: 'all 0.3s ease',
    };

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 2rem',
        maxWidth: '1200px',
        margin: '0 auto',
    };

    const logoStyle: React.CSSProperties = {
        color: 'var(--light)',
        textDecoration: 'none',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        letterSpacing: '-0.02em',
    };

    const linksContainerStyle: React.CSSProperties = {
        display: 'flex',
        gap: '2rem',
        alignItems: 'center',
    };

    const linkStyle: React.CSSProperties = {
        color: 'var(--light)',
        textDecoration: 'none',
        fontSize: '0.95rem',
        transition: 'color 0.2s ease',
        opacity: 0.9,
    };

    const mobileMenuButtonStyle: React.CSSProperties = {
        display: 'none',
        background: 'none',
        border: 'none',
        color: 'var(--light)',
        fontSize: '1.5rem',
        cursor: 'pointer',
        padding: '0.5rem',
    };

    const mobileLinksStyle: React.CSSProperties = {
        display: isMobileMenuOpen ? 'flex' : 'none',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem 2rem',
        background: 'var(--primary)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    };

    return (
        <nav style={navStyle} role="navigation" aria-label="Main navigation">
            <div style={containerStyle}>
                <a href="index.html" style={logoStyle} aria-label="DyGram home">
                    DyGram<span style={{ color: 'var(--accent)' }}>.</span>
                </a>

                <button
                    style={mobileMenuButtonStyle}
                    className="mobile-menu-toggle"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-expanded={isMobileMenuOpen}
                    aria-label="Toggle navigation menu"
                >
                    ☰
                </button>

                <div style={linksContainerStyle} className="nav-links">
                    <a href="quick-start.html" style={linkStyle} className="nav-link">Quick Start</a>
                    <a href="examples-index.html" style={linkStyle} className="nav-link">Examples</a>
                    <a href="api.html" style={linkStyle} className="nav-link">API</a>
                    <a href="playground-mobile.html" style={linkStyle} className="nav-link">Playground</a>
                    <a
                        href="https://github.com/christopherdebeer/machine"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ ...linkStyle, color: 'var(--accent)' }}
                        className="nav-link"
                        aria-label="GitHub repository (opens in new window)"
                    >
                        GitHub
                    </a>
                </div>
            </div>

            <div style={mobileLinksStyle} className="mobile-nav-links">
                <a href="quick-start.html" style={linkStyle}>Quick Start</a>
                <a href="examples-index.html" style={linkStyle}>Examples</a>
                <a href="api.html" style={linkStyle}>API</a>
                <a href="playground-mobile.html" style={linkStyle}>Playground</a>
                <a
                    href="https://github.com/christopherdebeer/machine"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...linkStyle, color: 'var(--accent)' }}
                >
                    GitHub
                </a>
            </div>

            <style>{`
                @media (max-width: 768px) {
                    .mobile-menu-toggle {
                        display: block !important;
                    }
                    .nav-links {
                        display: none !important;
                    }
                }

                .nav-link:hover {
                    color: var(--accent) !important;
                    opacity: 1 !important;
                }

                .skip-link {
                    position: absolute;
                    top: -40px;
                    left: 0;
                    background: var(--accent);
                    color: white;
                    padding: 8px;
                    text-decoration: none;
                    z-index: 10000;
                }

                .skip-link:focus {
                    top: 0;
                }
            `}</style>
        </nav>
    );
};
