import React from 'react';
import { createRoot } from 'react-dom/client';
import SyntaxGuide from '../../docs/SyntaxGuide.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<SyntaxGuide />);
}
