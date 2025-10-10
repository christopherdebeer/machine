import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Examples from '../../docs/Examples.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <Examples />
        </StrictMode>
    );
}
