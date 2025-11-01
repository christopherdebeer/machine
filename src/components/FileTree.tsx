/**
 * FileTree Component
 *
 * Displays a compact, collapsible file tree for browsing machine files
 * Supports folder navigation with into/back pattern like examples
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
}

const Container = styled.div<{ $collapsed?: boolean }>`
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    font-size: 12px;
    max-height: ${props => props.$collapsed ? 'auto' : '300px'};
    overflow: hidden;
    display: flex;
    flex-direction: column;
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
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;

    &:hover {
        background: #333336;
    }
`;

const HeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
`;

const ToggleIcon = styled.span<{ $collapsed: boolean }>`
    font-size: 10px;
    transition: transform 0.2s ease;
    transform: ${props => props.$collapsed ? 'rotate(0deg)' : 'rotate(90deg)'};
`;

const StatusBadge = styled.span<{ $available: boolean }>`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: ${props => props.$available ? '#1a7f37' : '#6e7681'};
    color: white;
    font-weight: normal;
`;

const Content = styled.div<{ $collapsed?: boolean }>`
    display: ${props => props.$collapsed ? 'none' : 'flex'};
    flex-direction: column;
    overflow-y: auto;
    max-height: 300px;
`;

const BackButton = styled.div`
    background: #2d2d30;
    padding: 6px 8px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 6px;
    color: #4db8ff;
    border-bottom: 1px solid #3e3e42;
    font-weight: 500;

    &:hover {
        background: #333336;
        color: #80ccff;
    }
`;

const CategoryButton = styled.div`
    background: #1e1e1e;
    padding: 6px 8px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #cccccc;
    border-bottom: 1px solid #2d2d30;

    &:hover {
        background: #2a2d2e;
        color: #ffffff;
    }
`;

const CategoryIcon = styled.span`
    font-size: 10px;
    color: #858585;
`;

const CategoryName = styled.span`
    flex: 1;
`;

const FileCount = styled.span`
    font-size: 10px;
    color: #858585;
`;

const FileItem = styled.div`
    padding: 6px 8px 6px 24px;
    cursor: pointer;
    color: #d4d4d4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: #1e1e1e;
    border-bottom: 1px solid #252526;

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

const EmptyMessage = styled.div`
    padding: 12px;
    text-align: center;
    color: #858585;
    font-style: italic;
`;

const SearchContainer = styled.div`
    padding: 8px;
    border-bottom: 1px solid #3e3e42;
    background: #1e1e1e;
`;

const SearchInput = styled.input`
    width: 100%;
    background: #3e3e42;
    color: #d4d4d4;
    border: 1px solid #505053;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: #0e639c;
    }

    &::placeholder {
        color: #858585;
    }
`;

const ActionBar = styled.div`
    display: flex;
    gap: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid #3e3e42;
    background: #2d2d30;
`;

const ActionButton = styled.button`
    background: transparent;
    border: 1px solid #505053;
    color: #cccccc;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.2s ease;

    &:hover {
        background: #3e3e42;
        border-color: #0e639c;
        color: #ffffff;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

export const FileTree: React.FC<FileTreeProps> = ({ onSelectFile, workingDir = 'examples' }) => {
    const [categories, setCategories] = useState<Map<string, CategoryNode>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [apiAvailable, setApiAvailable] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

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
                    });
                }

                categoryMap.get(category)!.files.push(file);
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

    const toggleCollapsed = () => {
        setCollapsed(prev => !prev);
    };

    const handleCategoryClick = (categoryName: string) => {
        setSelectedCategory(categoryName);
    };

    const handleBackClick = () => {
        setSelectedCategory(null);
    };

    const handleFileClick = async (file: FileInfo) => {
        try {
            // Read the file content from the API
            const response = await fetch(`/api/files/read?file=${encodeURIComponent(file.path)}&dir=${encodeURIComponent(workingDir)}`);
            if (!response.ok) {
                throw new Error('Failed to read file');
            }
            const data = await response.json();
            onSelectFile(file.path, data.content);
        } catch (err) {
            console.error('Error reading file:', err);
            alert('Failed to read file: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
    };

    if (loading) {
        return (
            <Container $collapsed={collapsed}>
                <Header onClick={toggleCollapsed}>
                    <HeaderLeft>
                        <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                        <span>Files</span>
                    </HeaderLeft>
                    <StatusBadge $available={false}>Loading...</StatusBadge>
                </Header>
                <Content $collapsed={collapsed}>
                    <LoadingMessage>Loading files...</LoadingMessage>
                </Content>
            </Container>
        );
    }

    if (error && !apiAvailable) {
        return (
            <Container $collapsed={collapsed}>
                <Header onClick={toggleCollapsed}>
                    <HeaderLeft>
                        <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                        <span>Files</span>
                    </HeaderLeft>
                    <StatusBadge $available={false}>Offline</StatusBadge>
                </Header>
                <Content $collapsed={collapsed}>
                    <EmptyMessage>Using embedded examples</EmptyMessage>
                </Content>
            </Container>
        );
    }

    if (categories.size === 0) {
        return (
            <Container $collapsed={collapsed}>
                <Header onClick={toggleCollapsed}>
                    <HeaderLeft>
                        <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                        <span>Files</span>
                    </HeaderLeft>
                    <StatusBadge $available={apiAvailable}>
                        {apiAvailable ? 'Online' : 'Offline'}
                    </StatusBadge>
                </Header>
                <Content $collapsed={collapsed}>
                    <EmptyMessage>No files found</EmptyMessage>
                </Content>
            </Container>
        );
    }

    // Get selected category files with filtering
    const selectedCategoryNode = selectedCategory ? categories.get(selectedCategory) : null;
    const filteredFiles = selectedCategoryNode
        ? selectedCategoryNode.files.filter(file =>
            file.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            file.path.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : [];

    // Check if local mode (DYGRAM_LOCAL_MODE environment variable)
    const isLocalMode = workingDir !== 'examples';

    return (
        <Container $collapsed={collapsed}>
            <Header onClick={toggleCollapsed}>
                <HeaderLeft>
                    <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                    <span>Files</span>
                </HeaderLeft>
                <StatusBadge $available={apiAvailable}>
                    {apiAvailable ? 'Online' : 'Offline'}
                </StatusBadge>
            </Header>
            <Content $collapsed={collapsed}>
                {selectedCategory && selectedCategoryNode ? (
                    // Show files in selected category
                    <>
                        {isLocalMode && (
                            <ActionBar>
                                <ActionButton title="Create new file">+ New</ActionButton>
                                <ActionButton title="Refresh file list" onClick={loadFiles}>⟳</ActionButton>
                            </ActionBar>
                        )}
                        <SearchContainer>
                            <SearchInput
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </SearchContainer>
                        <BackButton onClick={handleBackClick}>
                            ← Back to folders
                        </BackButton>
                        {filteredFiles.length > 0 ? (
                            filteredFiles.map(file => (
                                <FileItem
                                    key={file.path}
                                    onClick={() => handleFileClick(file)}
                                    title={file.path}
                                >
                                    {file.name}
                                </FileItem>
                            ))
                        ) : (
                            <EmptyMessage>
                                {searchQuery ? 'No files match your search' : 'No files found'}
                            </EmptyMessage>
                        )}
                    </>
                ) : (
                    // Show category list
                    <>
                        {Array.from(categories.values()).map(category => (
                            <CategoryButton
                                key={category.name}
                                onClick={() => handleCategoryClick(category.name)}
                            >
                                <CategoryIcon>📁</CategoryIcon>
                                <CategoryName>{category.name}</CategoryName>
                                <FileCount>{category.files.length}</FileCount>
                            </CategoryButton>
                        ))}
                    </>
                )}
            </Content>
        </Container>
    );
};
