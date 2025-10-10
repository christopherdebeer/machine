import React from 'react';
import { createRoot } from 'react-dom/client';
import ApiPage from '../../docs/Api.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(<ApiPage />);
}
