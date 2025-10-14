import React from 'react';
import { createRoot } from 'react-dom/client';
import LlmClientUsage from '../../docs/LlmClientUsage.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<LlmClientUsage />);
}
