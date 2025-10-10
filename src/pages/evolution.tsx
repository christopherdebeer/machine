import React from 'react';
import { createRoot } from 'react-dom/client';
import EvolutionPage from './Evolution.mdx';

const root = document.getElementById('root');
if (root) {
    createRoot(root).render(<EvolutionPage />);
}
