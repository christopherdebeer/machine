import React from 'react';
import { createRoot } from 'react-dom/client';
import GrammarReference from '../../docs/GrammarReference.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<GrammarReference />);
}
