import React, { useEffect } from 'react';

interface MetaTagsProps {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
}

export const MetaTags: React.FC<MetaTagsProps> = ({
    title = 'DyGram | Thought → System',
    description = 'DyGram is a dynamic prototyping language featuring Machine DSL - a lean, executable language for rapid system design that evolves from sketches to complete implementations.',
    image = '/machine/icon.jpg',
    url = 'https://christopherdebeer.github.io/machine/',
    type = 'website'
}) => {
    useEffect(() => {
        // Update document title
        document.title = title;

        // Update or create meta tags
        const updateMetaTag = (name: string, content: string, property = false) => {
            const attribute = property ? 'property' : 'name';
            let element = document.querySelector(`meta[${attribute}="${name}"]`);

            if (!element) {
                element = document.createElement('meta');
                element.setAttribute(attribute, name);
                document.head.appendChild(element);
            }

            element.setAttribute('content', content);
        };

        // Standard meta tags
        updateMetaTag('description', description);
        updateMetaTag('keywords', 'DSL, state machine, workflow, Langium, TypeScript, Machine, DyGram, prototyping, evolution, dynamic language');

        // Open Graph tags
        updateMetaTag('og:title', title, true);
        updateMetaTag('og:description', description, true);
        updateMetaTag('og:image', `https://christopherdebeer.github.io${image}`, true);
        updateMetaTag('og:url', url, true);
        updateMetaTag('og:type', type, true);
        updateMetaTag('og:site_name', 'DyGram', true);

        // Twitter Card tags
        updateMetaTag('twitter:card', 'summary_large_image');
        updateMetaTag('twitter:title', title);
        updateMetaTag('twitter:description', description);
        updateMetaTag('twitter:image', `https://christopherdebeer.github.io${image}`);

        // Canonical URL
        let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            document.head.appendChild(canonical);
        }
        canonical.href = url;

    }, [title, description, image, url, type]);

    return null;
};
