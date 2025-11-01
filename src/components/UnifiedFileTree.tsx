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

const StatusBadge = styled.span<{ $available: boolean | null }>`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: ${props => props.$available === true ? '#1a7f37' : props.$available === false ? '#bf8700' : '#6e7681'};
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

export const UnifiedFileTree: React.FC<UnifiedFileTreeProps> = ({
    fileService,
    onSelectFile,
    onFilesChanged
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/']));
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

    const handleFileClick = async (file: FileAccessFile) => {
        setActiveFile(file.path);

        // Load content if not already loaded
        let content = file.content;
        if (!content) {
            content = await fileService.readFile(file.path) || '';
        }

        onSelectFile(file.path, content);
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
        }

        return nodes;
    };

    if (loading) {
        return (
            <Container $collapsed={collapsed}>
                <Header onClick={() => setCollapsed(!collapsed)}>
                    <HeaderLeft>
                        <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                        <span>Files</span>
                    </HeaderLeft>
                    <StatusBadge $available={null}>Loading...</StatusBadge>
                </Header>
                <Content $collapsed={collapsed}>
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
        <Container $collapsed={collapsed}>
            <Header onClick={() => setCollapsed(!collapsed)}>
                <HeaderLeft>
                    <ToggleIcon $collapsed={collapsed}>▶</ToggleIcon>
                    <span>Files</span>
                </HeaderLeft>
                <StatusBadge $available={apiAvailable}>
                    {apiAvailable ? `API: ${apiFileCount} | VFS: ${vfsFileCount}` : `VFS: ${vfsFileCount}`}
                </StatusBadge>
            </Header>
            <Content $collapsed={collapsed}>
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
                {fileCount === 0 ? (
                    <EmptyMessage>No files available</EmptyMessage>
                ) : (
                    renderDirectory(directoryTree)
                )}
            </Content>
        </Container>
    );
};
