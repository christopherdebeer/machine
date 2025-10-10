import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import VscodeExtension from '../../docs/VscodeExtension.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <VscodeExtension />
        </StrictMode>
    );
}
