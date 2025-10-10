import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Blog from './Blog.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(
        <StrictMode>
            <Blog />
        </StrictMode>
    );
}
