import React from 'react';
import { createRoot } from 'react-dom/client';
import IndexPage from './Index.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(<IndexPage />);
}
