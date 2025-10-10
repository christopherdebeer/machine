import React from 'react';
import { createRoot } from 'react-dom/client';
import RuntimeAndEvolution from '../../docs/RuntimeAndEvolution.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<RuntimeAndEvolution />);
}
