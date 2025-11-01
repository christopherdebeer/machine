/**
 * FileTree Component
 *
 * Displays a compact, collapsible file tree for browsing machine files
 */

import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { listFiles, isFileApiAvailable, type FileInfo } from '../api/files-api';

interface FileTreeProps {
    onSelectFile: (path: string, content: string) => void;
    workingDir?: string;
}

interface CategoryNode {
    name: string;
    files: FileInfo[];
    expanded: boolean;
}

const Container = styled.div`
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    font-size: 12px;
    max-height: 300px;
    overflow-y: auto;
`;

const Header = styled.div`
    background: #2d2d30;
    padding: 6px 8px;
    font-weight: 600;
    color: #cccccc;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 1;
`;

const StatusBadge = styled.span<{ $available: boolean }>`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: ${props => props.$available ? '#1a7f37' : '#6e7681'};
    color: white;
    font-weight: normal;
`;

const CategoryHeader = styled.div`
    background: #2d2d30;
    padding: 4px 8px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #cccccc;

    &:hover {
        background: #333336;
    }
`;

const CategoryIcon = styled.span<{ $expanded: boolean }>`
    font-size: 10px;
    transition: transform 0.2s ease;
    transform: ${props => props.$expanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const CategoryName = styled.span`
    flex: 1;
`;

const FileCount = styled.span`
    font-size: 10px;
    color: #858585;
`;

const FileList = styled.div`
    background: #1e1e1e;
`;

const FileItem = styled.div`
    padding: 4px 8px 4px 24px;
    cursor: pointer;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
        background: #2a2d2e;
        color: #ffffff;
    }
`;

const LoadingMessage = styled.div`
    padding: 12px;
    text-align: center;
    color: #858585;
`;

const ErrorMessage = styled.div`
    padding: 12px;
    color: #f48771;
    font-size: 11px;
`;

const EmptyMessage = styled.div`
    padding: 12px;
    text-align: center;
    color: #858585;
    font-style: italic;
`;

export const FileTree: React.FC<FileTreeProps> = ({ onSelectFile, workingDir = 'examples' }) => {
    const [categories, setCategories] = useState<Map<string, CategoryNode>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiAvailable, setApiAvailable] = useState(false);

    useEffect(() => {
        loadFiles();
    }, [workingDir]);

    const loadFiles = async () => {
        setLoading(true);
        setError(null);

        try {
            // Check if API is available
            const available = await isFileApiAvailable();
            setApiAvailable(available);

            if (!available) {
                setError('File API not available. Using embedded examples.');
                setLoading(false);
                return;
            }

            // Load files from API
            const response = await listFiles(workingDir);

            // Group files by category
            const categoryMap = new Map<string, CategoryNode>();

            for (const file of response.files) {
                const category = file.category || 'root';

                if (!categoryMap.has(category)) {
                    categoryMap.set(category, {
                        name: category,
                        files: [],
                        expanded: false
                    });
                }

                categoryMap.get(category)!.files.push(file);
            }

            // Expand first category by default if there are files
            if (categoryMap.size > 0) {
                const firstCategory = categoryMap.values().next().value;
                if (firstCategory) {
                    firstCategory.expanded = true;
                }
            }

            setCategories(categoryMap);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load files';
            setError(message);
            console.error('Error loading files:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleCategory = (categoryName: string) => {
        setCategories(prev => {
            const newMap = new Map(prev);
            const category = newMap.get(categoryName);
            if (category) {
                category.expanded = !category.expanded;
                newMap.set(categoryName, { ...category });
            }
            return newMap;
        });
    };

    const handleFileClick = async (file: FileInfo) => {
        try {
            // For now, read the file content from the API
            const response = await fetch(`/api/files/read?file=${encodeURIComponent(file.path)}&dir=${encodeURIComponent(workingDir)}`);
            if (!response.ok) {
                throw new Error('Failed to read file');
            }
            const content = await response.text();
            onSelectFile(file.path, content);
        } catch (err) {
            console.error('Error reading file:', err);
            alert('Failed to read file: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
    };

    if (loading) {
        return (
            <Container>
                <Header>
                    Files
                    <StatusBadge $available={false}>Loading...</StatusBadge>
                </Header>
                <LoadingMessage>Loading files...</LoadingMessage>
            </Container>
        );
    }

    if (error && !apiAvailable) {
        return (
            <Container>
                <Header>
                    Files
                    <StatusBadge $available={false}>Offline</StatusBadge>
                </Header>
                <EmptyMessage>Using embedded examples</EmptyMessage>
            </Container>
        );
    }

    if (categories.size === 0) {
        return (
            <Container>
                <Header>
                    Files
                    <StatusBadge $available={apiAvailable}>
                        {apiAvailable ? 'Online' : 'Offline'}
                    </StatusBadge>
                </Header>
                <EmptyMessage>No files found</EmptyMessage>
            </Container>
        );
    }

    return (
        <Container>
            <Header>
                Files
                <StatusBadge $available={apiAvailable}>
                    {apiAvailable ? 'Online' : 'Offline'}
                </StatusBadge>
            </Header>
            {Array.from(categories.values()).map(category => (
                <div key={category.name}>
                    <CategoryHeader onClick={() => toggleCategory(category.name)}>
                        <CategoryIcon $expanded={category.expanded}>▶</CategoryIcon>
                        <CategoryName>{category.name}</CategoryName>
                        <FileCount>{category.files.length}</FileCount>
                    </CategoryHeader>
                    {category.expanded && (
                        <FileList>
                            {category.files.map(file => (
                                <FileItem
                                    key={file.path}
                                    onClick={() => handleFileClick(file)}
                                    title={file.path}
                                >
                                    {file.name}
                                </FileItem>
                            ))}
                        </FileList>
                    )}
                </div>
            ))}
        </Container>
    );
};
