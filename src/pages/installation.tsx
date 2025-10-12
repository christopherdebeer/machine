import React from 'react';
import { createRoot } from 'react-dom/client';
import Installation from '../../docs/Installation.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Installation />);
}
