/**
 * Shared example loader for both Monaco and CodeMirror playgrounds
 * Provides dynamic example loading with category-based navigation
 * Supports both API-based loading (local + Vercel) and fallback to embedded examples
 *
 * @deprecated This module uses embedded examples from generated/examples-list.json.
 *
 * TODO: Deprecate in favor of FileAccessService and Files API:
 * - FileAccessService (src/playground/file-access-service.ts) provides unified API
 * - Loads examples dynamically from /api/files/list endpoint
 * - No need for embedded examples-list.json generation
 * - Examples extracted by prebuild.js remain in examples/ directory
 * - CodeMirrorPlayground already uses this modern approach
 * - MonacoPlayground still uses this legacy system and needs migration
 *
 * See src/playground/file-access-service.ts and src/components/UnifiedFileTree.tsx
 * for the modern file access pattern.
 */

import examplesList from '../generated/examples-list.json' with { type: 'json' };
import { listFiles, isFileApiAvailable, type FileInfo } from '../api/files-api.js'

export interface Example {
    path: string;
    name: string;
    title: string;
    category: string;
    filename: string;
    content: string;
}

// Cache for API-loaded examples
let apiExamplesCache: Example[] | null = null;
let apiAvailableCache: boolean | null = null;

/**
 * Check if file API is available and cache result
 */
async function checkApiAvailable(): Promise<boolean> {
    if (apiAvailableCache !== null) {
        return apiAvailableCache;
    }

    apiAvailableCache = await isFileApiAvailable();
    return apiAvailableCache;
}

/**
 * Convert FileInfo to Example format
 */
function fileInfoToExample(file: FileInfo, content: string): Example {
    return {
        path: file.path,
        name: file.name,
        title: file.name,
        category: file.category,
        filename: file.filename,
        content
    };
}

/**
 * Load examples from API
 */
async function loadExamplesFromApi(): Promise<Example[]> {
    try {
        const response = await listFiles('examples');

        // Load content for each file
        const examples: Example[] = [];
        for (const file of response.files) {
            try {
                const contentResponse = await fetch(`/api/files/read?file=${encodeURIComponent(file.path)}&dir=examples`);
                if (contentResponse.ok) {
                    const content = await contentResponse.text();
                    examples.push(fileInfoToExample(file, content));
                }
            } catch (error) {
                console.warn(`Failed to load content for ${file.path}:`, error);
            }
        }

        return examples;
    } catch (error) {
        console.error('Failed to load examples from API:', error);
        return [];
    }
}

/**
 * Get all examples (API-first, fallback to embedded)
 */
export async function getAllExamplesAsync(): Promise<Example[]> {
    // Return cached API examples if available
    if (apiExamplesCache) {
        return apiExamplesCache;
    }

    // Try to load from API
    const apiAvailable = await checkApiAvailable();
    if (apiAvailable) {
        const apiExamples = await loadExamplesFromApi();
        if (apiExamples.length > 0) {
            apiExamplesCache = apiExamples;
            return apiExamples;
        }
    }

    // Fallback to embedded examples
    return examplesList as Example[];
}

/**
 * Get all examples (synchronous - returns embedded only)
 * @deprecated Use getAllExamplesAsync for API support
 */
export function getAllExamples(): Example[] {
    return examplesList as Example[];
}

/**
 * Get examples grouped by category
 */
export function getExamplesByCategory(): Map<string, Example[]> {
    const categoriesMap = new Map<string, Example[]>();

    for (const example of examplesList) {
        if (!categoriesMap.has(example.category)) {
            categoriesMap.set(example.category, []);
        }
        categoriesMap.get(example.category)!.push(example as Example);
    }

    return categoriesMap;
}

/**
 * Get example by key (name in kebab-case)
 */
export function getExampleByKey(key: string): Example | undefined {
    return examplesList.find(ex => {
        const exampleKey = ex.name.toLowerCase().replace(/\s+/g, '-');
        return exampleKey === key;
    }) as Example | undefined;
}

/**
 * Get example content by key
 */
export function getExampleContent(key: string): string | undefined {
    const example = getExampleByKey(key);
    return example?.content;
}

/**
 * Category display order
 */
const CATEGORY_ORDER = [
    'basic',
    'workflows',
    'meta-programming',
    'rails',
    'model-configuration',
    'attributes',
    'edges',
    'nesting',
    'complex',
    'advanced',
    'documentation',
    'validation',
    'context',
    'edge-cases',
    'stress'
];

/**
 * Sort categories by predefined order
 */
export function sortCategories(categories: string[]): string[] {
    return categories.sort((a, b) => {
        const indexA = CATEGORY_ORDER.indexOf(a);
        const indexB = CATEGORY_ORDER.indexOf(b);

        const orderA = indexA === -1 ? CATEGORY_ORDER.length : indexA;
        const orderB = indexB === -1 ? CATEGORY_ORDER.length : indexB;

        if (orderA !== orderB) {
            return orderA - orderB;
        }

        return a.localeCompare(b);
    });
}

/**
 * Render example buttons to a container
 * Returns a cleanup function
 */
export function renderExampleButtons(
    container: HTMLElement,
    onExampleSelect: (content: string, example: Example) => void,
    options: {
        categoryView?: boolean; // Enable drill-down category navigation
        buttonClass?: string;
        categoryButtonClass?: string;
    } = {}
): () => void {
    const {
        categoryView = false,
        buttonClass = 'example-btn',
        categoryButtonClass = 'example-btn category-btn'
    } = options;

    const categoriesMap = getExamplesByCategory();
    const sortedCategories = sortCategories(Array.from(categoriesMap.keys()));

    // Helper to create example key
    const createExampleKey = (example: Example) =>
        example.name.toLowerCase().replace(/\s+/g, '-');

    if (!categoryView) {
        // Flat view: show all examples
        container.innerHTML = '';
        for (const example of examplesList) {
            const key = createExampleKey(example as Example);
            const btn = document.createElement('button');
            btn.className = buttonClass;
            btn.setAttribute('data-example', key);
            btn.setAttribute('data-category', example.category);
            btn.textContent = example.name;
            btn.title = example.title;
            container.appendChild(btn);

            btn.addEventListener('click', () => {
                onExampleSelect(example.content, example as Example);
            });
        }
    } else {
        // Category view with drill-down navigation
        const renderCategories = () => {
            container.innerHTML = '';

            for (const category of sortedCategories) {
                const categoryExamples = categoriesMap.get(category)!;
                const btn = document.createElement('button');
                btn.className = categoryButtonClass;
                btn.setAttribute('data-category', category);
                btn.textContent = `${category} (${categoryExamples.length})`;
                btn.title = `View ${categoryExamples.length} examples in ${category}`;
                container.appendChild(btn);

                btn.addEventListener('click', () => {
                    renderExamples(category, categoryExamples);
                });
            }
        };

        const renderExamples = (category: string, categoryExamples: Example[]) => {
            container.innerHTML = '';

            // Add back button
            const backBtn = document.createElement('button');
            backBtn.className = `${buttonClass} back-btn`;
            backBtn.textContent = '← Back to Categories';
            backBtn.title = 'Return to category list';
            container.appendChild(backBtn);

            backBtn.addEventListener('click', () => {
                renderCategories();
            });

            // Add examples from this category
            for (const example of categoryExamples) {
                const key = createExampleKey(example);

                const btn = document.createElement('button');
                btn.className = buttonClass;
                btn.setAttribute('data-example', key);
                btn.setAttribute('data-category', example.category);
                btn.textContent = example.name;
                btn.title = example.title;
                container.appendChild(btn);

                btn.addEventListener('click', () => {
                    onExampleSelect(example.content, example);
                });
            }
        };

        // Start with category view
        renderCategories();
    }

    // Return cleanup function
    return () => {
        container.innerHTML = '';
    };
}

/**
 * Get a default example (first basic example or first available)
 */
export function getDefaultExample(): Example {
    const basicExamples = getExamplesByCategory().get('basic');
    if (basicExamples && basicExamples.length > 0) {
        return basicExamples[0];
    }

    return examplesList[0] as Example;
}
