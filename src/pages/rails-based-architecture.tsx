import React from 'react';
import ReactDOM from 'react-dom/client';
import Content from '../../docs/RailsBasedArchitecture.mdx';
import '../index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <Content />
    </React.StrictMode>
);
