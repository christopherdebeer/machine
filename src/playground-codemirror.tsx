/**
 * CodeMirror Playground Entry Point
 * 
 * Renders the CodeMirror playground React application
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeMirrorPlayground } from './components/CodeMirrorPlayground.js'

// Initialize the playground
const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <CodeMirrorPlayground />
    </React.StrictMode>
);
