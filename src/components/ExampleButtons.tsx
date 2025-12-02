/**
 * ExampleButtons Component
 *
 * Renders example buttons for loading code examples into the playground
 *
 * @deprecated This component uses embedded examples from shared-examples.ts.
 *
 * TODO: Migrate to UnifiedFileTree component which uses the Files API:
 * - Loads examples dynamically from examples/ directory via /api/files/list
 * - Supports both API files and VirtualFileSystem
 * - Enables file creation, editing, and deletion
 * - Provides better file organization with directory navigation
 *
 * See src/components/UnifiedFileTree.tsx for the modern replacement.
 * This component is only used by MonacoPlayground which also needs migration.
 */

import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getAllExamples, type Example } from '../language/shared-examples.js'

interface ExampleButtonsProps {
    onLoadExample: (content: string, example: Example) => void;
    categoryView?: boolean;
}

const Container = styled.div`
    display: flex;
    gap: 0.3em;
    font-size: 0.6em;
    flex-wrap: wrap;

    & > span {
        display: inline-flex
;
    align-items: center;
    }
`;

const Button = styled.button`
    background: #3e3e42;
    color: #d4d4d4;
    border: none;
    padding: 0.4em 0.8em;
    border-radius: 4px;
    font-size: 1em;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
        background: #505053;
    }

    

    &.back-btn {
        background: #2d2d30;
        border: 1px solid #3e3e42;

        &:hover {
            background: #3e3e42;
        }
    }
`;


export const ExampleButtons: React.FC<ExampleButtonsProps> = ({
    onLoadExample,
    categoryView = false
}) => {
    const [examples, setExamples] = useState<Example[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    useEffect(() => {
        // Load examples from shared-examples module
        const loadExamples = async () => {
            try {
                const exampleList = getAllExamples();
                setExamples(exampleList);
            } catch (error) {
                console.error('Failed to load examples:', error);
            } finally {
                setLoading(false);
            }
        };

        loadExamples();
    }, []);

    if (loading) {
        return <Container>Loading examples...</Container>;
    }

    if (categoryView) {
        // Group examples by category
        const categories = examples.reduce((acc, example) => {
            const category = example.category || 'General';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(example);
            return acc;
        }, {} as Record<string, Example[]>);

        // Show category overview
        if (!selectedCategory) {
            return (
                <Container> <span>Examples: </span>
                    {Object.entries(categories).map(([category, categoryExamples]) => (
                        <Button
                            key={category}
                            className="category-btn"
                            onClick={() => setSelectedCategory(category)}
                        >
                            {category} ({categoryExamples.length})
                        </Button>
                    ))}
                </Container>
            );
        }

        // Show examples in selected category
        const categoryExamples = categories[selectedCategory] || [];
        return (
            <Container>
                <Button
                    className="back-btn"
                    onClick={() => setSelectedCategory(null)}
                >
                    ← Back to Example categories
                </Button>
                {categoryExamples.map((example) => (
                    <Button
                        key={example.name}
                        onClick={() => onLoadExample(example.content, example)}
                    >
                        {example.name}
                    </Button>
                ))}
            </Container>
        );
    }

    return (
        <Container>
            {examples.map((example) => (
                <Button
                    key={example.name}
                    onClick={() => onLoadExample(example.content, example)}
                >
                    {example.name}
                </Button>
            ))}
        </Container>
    );
};
