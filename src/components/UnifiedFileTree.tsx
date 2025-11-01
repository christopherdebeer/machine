/**
 * Unified File Tree Component
 *
 * Displays files from both File API and VirtualFileSystem
 * Prefers API files but allows VFS for creation/editing
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { FileAccessService, type FileAccessFile } from '../playground/file-access-service';

interface UnifiedFileTreeProps {
    fileService: FileAccessService;
    onSelectFile: (path: string, content: string) => void;
    onFilesChanged?: () => void;
}

interface DirectoryNode {
    name: string;
    path: string;
    files: FileAccessFile[];
    subdirs: DirectoryNode[];
}

const Container = styled.div`
    background: #252526;
    font-size: 12px;
    max-height: 400px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
`;

const StatusBar = styled.div`
    background: #2d2d30;
    padding: 6px 8px;
    font-size: 10px;
    color: #cccccc;
    border-bottom: 1px solid #3e3e42;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    flex-shrink: 0;
`;

const StatusBadge = styled.span<{ $available: boolean | null }>`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: ${props => props.$available === true ? '#1a7f37' : props.$available === false ? '#bf8700' : '#6e7681'};
    color: white;
    font-weight: normal;
`;

const Content = styled.div`
    display: flex;
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

const FileItem = styled.div<{ $level: number; $active?: boolean; $source?: 'api' | 'vfs' }>`
    padding: 4px 8px 4px ${props => 24 + props.$level * 16}px;
    cursor: pointer;
    color: ${props => props.$active ? '#ffffff' : '#d4d4d4'};
    background: ${props => props.$active ? '#0e639c' : '#1e1e1e'};
    border-bottom: 1px solid #252526;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;

    &:hover {
        background: ${props => props.$active ? '#1177bb' : '#2a2d2e'};
        color: #ffffff;
    }
`;

const FileSourceBadge = styled.span<{ $source: 'api' | 'vfs' }>`
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 2px;
    background: ${props => props.$source === 'api' ? '#1a7f37' : '#bf8700'};
    color: white;
    margin-left: auto;
    opacity: 0.7;
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

const LoadingMessage = styled.div`
    padding: 12px;
    text-align: center;
    color: #858585;
`;

const Breadcrumbs = styled.div`
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: #1e1e1e;
    border-bottom: 1px solid #3e3e42;
    font-size: 11px;
    color: #cccccc;
    overflow-x: auto;
    white-space: nowrap;
`;

const BreadcrumbItem = styled.span<{ $clickable?: boolean }>`
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    color: ${props => props.$clickable ? '#4FC3F7' : '#cccccc'};

    &:hover {
        text-decoration: ${props => props.$clickable ? 'underline' : 'none'};
    }
`;

const BreadcrumbSeparator = styled.span`
    color: #858585;
`;

export const UnifiedFileTree: React.FC<UnifiedFileTreeProps> = ({
    fileService,
    onSelectFile,
    onFilesChanged
}) => {
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
    const [currentDir, setCurrentDir] = useState<string>('/');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [files, setFiles] = useState<FileAccessFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [apiAvailable, setApiAvailable] = useState<boolean | null>(null);

    const loadFiles = useCallback(async () => {
        setLoading(true);
        try {
            const available = await fileService.checkApiAvailability();
            setApiAvailable(available);

            const allFiles = await fileService.listAllFiles();
            setFiles(allFiles);
        } catch (error) {
            console.error('Error loading files:', error);
        } finally {
            setLoading(false);
        }
    }, [fileService]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const buildDirectoryTree = useCallback((): DirectoryNode => {
        const root: DirectoryNode = {
            name: '/',
            path: '/',
            files: [],
            subdirs: []
        };

        const dirMap = new Map<string, DirectoryNode>();
        dirMap.set('/', root);

        // Filter files by search query
        const filteredFiles = searchQuery
            ? files.filter(file =>
                file.path.toLowerCase().includes(searchQuery.toLowerCase()) ||
                file.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : files;

        // Build directory structure
        for (const file of filteredFiles) {
            const pathParts = file.path.split('/').filter(p => p.length > 0);
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
    }, [files, searchQuery]);

    const handleDirClick = (path: string) => {
        // Navigate into the directory
        setCurrentDir(path);
        // Expand it in case we navigate back up
        setExpandedDirs(prev => new Set([...prev, path]));
    };

    const handleBreadcrumbClick = (path: string) => {
        setCurrentDir(path);
    };

    const handleFileClick = async (file: FileAccessFile) => {
        setActiveFile(file.path);

        try {
            // Always load content from fileService for API files, or use VFS content
            let content = file.content;
            if (!content || file.source === 'api') {
                // For API files, always fetch fresh content
                // For VFS files with no content, fetch as well
                content = await fileService.readFile(file.path) || '';
            }

            onSelectFile(file.path, content);
        } catch (error) {
            console.error('Error loading file:', error);
            alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const handleRefresh = async () => {
        await loadFiles();
        if (onFilesChanged) {
            onFilesChanged();
        }
    };

    const handleNewFile = () => {
        const filename = prompt('Enter filename (e.g., /myfile.dygram):');
        if (filename) {
            const normalizedPath = filename.startsWith('/') ? filename : '/' + filename;
            const vfs = fileService.getVFS();
            vfs.writeFile(normalizedPath, '// New file\nmachine "New Machine"\n\nstate Start\nstate End\n\nStart --> End');
            vfs.saveToLocalStorage();
            handleRefresh();
        }
    };

    const handleDeleteFile = async () => {
        if (activeFile) {
            const file = files.find(f => f.path === activeFile);
            if (file?.source === 'api') {
                alert('Cannot delete files from the API (read-only)');
                return;
            }

            if (confirm(`Delete ${activeFile}?`)) {
                fileService.deleteFile(activeFile);
                setActiveFile(null);
                handleRefresh();
            }
        }
    };

    const renderCurrentDirectory = (tree: DirectoryNode): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];

        // Find the current directory node
        const findDirNode = (node: DirectoryNode, targetPath: string): DirectoryNode | null => {
            if (node.path === targetPath) return node;
            for (const subdir of node.subdirs) {
                const found = findDirNode(subdir, targetPath);
                if (found) return found;
            }
            return null;
        };

        const currentDirNode = findDirNode(tree, currentDir);
        if (!currentDirNode) return nodes;

        // Render subdirectories
        for (const subdir of currentDirNode.subdirs) {
            nodes.push(
                <DirectoryItem
                    key={subdir.path}
                    $level={0}
                    onClick={() => handleDirClick(subdir.path)}
                >
                    <DirectoryIcon $expanded={false}>▶</DirectoryIcon>
                    📁 {subdir.name}
                </DirectoryItem>
            );
        }

        // Render files in current directory
        for (const file of currentDirNode.files) {
            const fileName = file.path.split('/').pop() || file.path;
            nodes.push(
                <FileItem
                    key={file.path}
                    $level={0}
                    $active={file.path === activeFile}
                    $source={file.source}
                    onClick={() => handleFileClick(file)}
                    title={`${file.path} (${file.source})`}
                >
                    📄 {fileName}
                    <FileSourceBadge $source={file.source}>
                        {file.source.toUpperCase()}
                    </FileSourceBadge>
                </FileItem>
            );
        }

        return nodes;
    };

    const renderBreadcrumbs = (): React.ReactNode => {
        const parts = currentDir === '/' ? [''] : currentDir.split('/').filter(p => p);
        const paths: { name: string; path: string }[] = [{ name: 'Root', path: '/' }];

        let accumulatedPath = '';
        for (const part of parts) {
            accumulatedPath += '/' + part;
            paths.push({ name: part, path: accumulatedPath });
        }

        return (
            <Breadcrumbs>
                {paths.map((item, index) => (
                    <React.Fragment key={item.path}>
                        {index > 0 && <BreadcrumbSeparator>/</BreadcrumbSeparator>}
                        <BreadcrumbItem
                            $clickable={index < paths.length - 1}
                            onClick={() => index < paths.length - 1 && handleBreadcrumbClick(item.path)}
                        >
                            {item.name}
                        </BreadcrumbItem>
                    </React.Fragment>
                ))}
            </Breadcrumbs>
        );
    };

    if (loading) {
        return (
            <Container>
                <StatusBar>
                    <StatusBadge $available={null}>Loading...</StatusBadge>
                </StatusBar>
                <Content>
                    <LoadingMessage>Loading files...</LoadingMessage>
                </Content>
            </Container>
        );
    }

    const directoryTree = buildDirectoryTree();
    const fileCount = files.length;
    const apiFileCount = files.filter(f => f.source === 'api').length;
    const vfsFileCount = files.filter(f => f.source === 'vfs').length;

    return (
        <Container>
            <StatusBar>
                <StatusBadge $available={apiAvailable}>
                    {apiAvailable ? `API: ${apiFileCount} | VFS: ${vfsFileCount}` : `VFS: ${vfsFileCount}`}
                </StatusBadge>
            </StatusBar>
            <Content>
                <ActionBar>
                    <ActionButton onClick={handleNewFile} title="Create new file (VFS)">
                        + New
                    </ActionButton>
                    <ActionButton onClick={handleRefresh} title="Refresh file list">
                        ⟳ Refresh
                    </ActionButton>
                    <ActionButton
                        onClick={handleDeleteFile}
                        disabled={!activeFile}
                        title="Delete selected file (VFS only)"
                    >
                        🗑 Delete
                    </ActionButton>
                    <ActionButton
                        onClick={() => fileService.getVFS().saveToLocalStorage()}
                        title="Save VFS to localStorage"
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
                {!searchQuery && renderBreadcrumbs()}
                {fileCount === 0 ? (
                    <EmptyMessage>No files available</EmptyMessage>
                ) : (
                    renderCurrentDirectory(directoryTree)
                )}
            </Content>
        </Container>
    );
};
