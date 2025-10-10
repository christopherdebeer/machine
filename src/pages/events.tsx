import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Events from './Events.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <Events />
        </StrictMode>
    );
}
