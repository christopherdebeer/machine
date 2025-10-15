import React from 'react';
import ReactDOM from 'react-dom/client';
import Content from '../../docs/examples/model-configuration.mdx';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <Content />
    </React.StrictMode>
);
