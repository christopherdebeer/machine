import React from 'react';
import { createRoot } from 'react-dom/client';
import Troubleshooting from '../../docs/Troubleshooting.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<Troubleshooting />);
}
