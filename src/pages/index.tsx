import React from 'react';
import ReactDOM from 'react-dom/client';
import { PageLayout } from '../components/PageLayout';
import Content from '../../docs/Index.mdx';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
    <React.StrictMode>
        <PageLayout title="Index" backLink={false}>
            <Content />
        </PageLayout>
    </React.StrictMode>
);
