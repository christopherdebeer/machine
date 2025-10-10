import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Libraries from '../../docs/Libraries.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <Libraries />
        </StrictMode>
    );
}
