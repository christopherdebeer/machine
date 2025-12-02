/**
 * Virtual File Tree Component
 *
 * Displays files from a VirtualFileSystem for import-enabled playground
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { VirtualFileSystem, type VirtualFile } from '../playground/virtual-filesystem.js'

interface VirtualFileTreeProps {
    vfs: VirtualFileSystem;
    onSelectFile: (path: string, content: string) => void;
    onFilesChanged?: () => void;
}

interface DirectoryNode {
    name: string;
    path: string;
    files: VirtualFile[];
    subdirs: DirectoryNode[];
}

const Container = styled.div<{ $collapsed?: boolean }>`
    background: #252526;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    font-size: 12px;
    max-height: ${props => props.$collapsed ? 'auto' : '400px'};
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

const FileCount = styled.span`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: #1a7f37;
    color: white;
    font-weight: normal;
`;

const Content = styled.div<{ $collapsed?: boolean }>`
    display: ${props => props.$collapsed ? 'none' : 'flex'};
    flex-direction: column;
    overflow-y: auto;
    max-height: 400px;
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

const DirectoryItem = styled.div<{ $level: number }>`
    padding: 4px 8px 4px ${props => 8 + props.$level * 16}px;
    cursor: pointer;
    color: #cccccc;
    background: #1e1e1e;
    border-bottom: 1px solid #252526;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;

    &:hover {
        background: #2a2d2e;
        color: #ffffff;
    }
`;

const DirectoryIcon = styled.span<{ $expanded: boolean }>`
    font-size: 10px;
    transition: transform 0.2s ease;
    transform: ${props => props.$expanded ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const FileItem = styled.div<{ $level: number; $active?: boolean }>`
    padding: 4px 8px 4px ${props => 24 + props.$level * 16}px;
    cursor: pointer;
    color: ${props => props.$active ? '#ffffff' : '#d4d4d4'};
    background: ${props => props.$active ? '#0e639c' : '#1e1e1e'};
    border-bottom: 1px solid #252526;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
        background: ${props => props.$active ? '#1177bb' : '#2a2d2e'};
        color: #ffffff;
    }
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

export const VirtualFileTree: React.FC<VirtualFileTreeProps> = ({
    vfs,
    onSelectFile,
    onFilesChanged
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const buildDirectoryTree = useCallback((): DirectoryNode => {
        const root: DirectoryNode = {
            name: '/',
            path: '/',
            files: [],
            subdirs: []
        };

        const allFiles = vfs.getAllFiles();
        const dirMap = new Map<string, DirectoryNode>();
        dirMap.set('/', root);

        // Filter files by search query
        const filteredFiles = searchQuery
            ? allFiles.filter(file =>
                file.path.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : allFiles;

        // Build directory structure
        for (const file of filteredFiles) {
            const pathParts = file.path.split('/').filter(p => p.length > 0);
            const fileName = pathParts[pathParts.length - 1];
            let currentPath = '';

            // Create directory nodes
            for (let i = 0; i < pathParts.length - 1; i++) {
                const part = pathParts[i];
                const parentPath = currentPath || '/';
                currentPath += '/' + part;

                if (!dirMap.has(currentPath)) {
                    const newDir: DirectoryNode = {
                        name: part,
                        path: currentPath,
                        files: [],
                        subdirs: []
                    };
                    dirMap.set(currentPath, newDir);

                    const parent = dirMap.get(parentPath);
                    if (parent) {
                        parent.subdirs.push(newDir);
                    }
                }
            }

            // Add file to its directory
            const dirPath = pathParts.length > 1 ? '/' + pathParts.slice(0, -1).join('/') : '/';
            const dir = dirMap.get(dirPath);
            if (dir) {
                dir.files.push(file);
            }
        }

        return root;
    }, [vfs, searchQuery, refreshTrigger]);

    const handleToggleDir = (path: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const handleFileClick = (file: VirtualFile) => {
        setActiveFile(file.path);
        onSelectFile(file.path, file.content);
    };

    const handleRefresh = () => {
        setRefreshTrigger(prev => prev + 1);
        if (onFilesChanged) {
            onFilesChanged();
        }
    };

    const handleNewFile = () => {
        const filename = prompt('Enter filename (e.g., /myfile.dygram):');
        if (filename) {
            const normalizedPath = filename.startsWith('/') ? filename : '/' + filename;
            vfs.writeFile(normalizedPath, '// New file\nmachine "New Machine"\n\nstate Start\nstate End\n\nStart --> End');
            handleRefresh();
        }
    };

    const handleDeleteFile = () => {
        if (activeFile) {
            if (confirm(`Delete ${activeFile}?`)) {
                vfs.deleteFile(activeFile);
                setActiveFile(null);
                handleRefresh();
            }
        }
    };

    const renderDirectory = (dir: DirectoryNode, level: number = 0): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        const isExpanded = expandedDirs.has(dir.path);

        // Render directory header (except for root)
        if (dir.path !== '/') {
            nodes.push(
                <DirectoryItem
                    key={dir.path}
                    $level={level}
                    onClick={() => handleToggleDir(dir.path)}
                >
                    <DirectoryIcon $expanded={isExpanded}>▶</DirectoryIcon>
                    📁 {dir.name}
                </DirectoryItem>
            );
        }

        // Render contents if expanded (or if root)
        if (isExpanded || dir.path === '/') {
            // Render subdirectories
            for (const subdir of dir.subdirs) {
                nodes.push(...renderDirectory(subdir, level + 1));
            }

            // Render files
            for (const file of dir.files) {
                const fileName = file.path.split('/').pop() || file.path;
                nodes.push(
                    <FileItem
                        key={file.path}
                        $level={dir.path === '/' ? level : level + 1}
                        $active={file.path === activeFile}
                        onClick={() => handleFileClick(file)}
                        title={file.path}
                    >
                        📄 {fileName}
                    </FileItem>
                );
            }
        }

        return nodes;
    };

    const directoryTree = buildDirectoryTree();
    const fileCount = vfs.size;

    return (
        <Container $collapsed={collapsed}>
            <Header onClick={() => setCollapsed(!collapsed)}>
                <HeaderLeft>
                    <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                    <span>Virtual Files</span>
                </HeaderLeft>
                <FileCount>{fileCount} files</FileCount>
            </Header>
            <Content $collapsed={collapsed}>
                <ActionBar>
                    <ActionButton onClick={handleNewFile} title="Create new file">
                        + New
                    </ActionButton>
                    <ActionButton onClick={handleRefresh} title="Refresh file list">
                        ⟳ Refresh
                    </ActionButton>
                    <ActionButton
                        onClick={handleDeleteFile}
                        disabled={!activeFile}
                        title="Delete selected file"
                    >
                        🗑 Delete
                    </ActionButton>
                    <ActionButton
                        onClick={() => vfs.saveToLocalStorage()}
                        title="Save to localStorage"
                    >
                        💾 Save
                    </ActionButton>
                </ActionBar>
                <SearchContainer>
                    <SearchInput
                        type="text"
                        placeholder="Search files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </SearchContainer>
                {fileCount === 0 ? (
                    <EmptyMessage>No files in virtual filesystem</EmptyMessage>
                ) : (
                    renderDirectory(directoryTree)
                )}
            </Content>
        </Container>
    );
};
