import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Integration from '../../docs/Integration.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <Integration />
        </StrictMode>
    );
}
