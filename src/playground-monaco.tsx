/**
 * Monaco Playground Entry Point
 * 
 * Renders the Monaco playground React application
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { MonacoPlayground } from './components/MonacoPlayground.js'

// Initialize the playground
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <MonacoPlayground />
    </React.StrictMode>
);
