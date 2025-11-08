import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSettings, saveSettings } from '../../language/shared-settings';
import { OutputData, OutputFormat } from '../OutputPanel';
import { VirtualFileSystem } from '../../playground/virtual-filesystem';
import { FileAccessService } from '../../playground/file-access-service';
import { getExampleByKey, getDefaultExample, type Example } from '../../language/shared-examples';
import { parseHashParams as parseHashParamsUtil, updateHashParams as updateHashParamsUtil } from '../../utils/url-encoding';
import { createMachineServices } from '../../language/machine-module';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { Machine } from '../../language/generated/ast';
import { generateGraphviz, generateJSON } from '../../language/generator/generator';
import { render as renderGraphviz } from '../../language/diagram-controls';
import { RailsExecutor } from '../../language/rails-executor';
import type { MachineData } from '../../language/base-executor';
import { RuntimeVisualizer } from '../../language/runtime-visualizer';

export type SectionSize = 'small' | 'medium' | 'big';

export interface PlaygroundEditorApi {
    setContent: (content: string) => void;
    getContent: () => string;
}

export interface PlaygroundControllerOptions {
    enableExecution?: boolean;
}

interface SectionStates {
    settingsCollapsed: boolean;
    editorCollapsed: boolean;
    outputCollapsed: boolean;
    executionCollapsed: boolean;
    editorSize: SectionSize;
    outputSize: SectionSize;
    executionSize: SectionSize;
    outputFormat: OutputFormat;
    fitToContainer: boolean;
}

const parseHashParams = parseHashParamsUtil;
const updateHashParams = updateHashParamsUtil;

const sizeEncodeMap: Record<SectionSize, string> = { small: 's', medium: 'm', big: 'b' };
const sizeDecodeMap: Record<string, SectionSize> = { s: 'small', m: 'medium', b: 'big' };

const formatEncodeMap: Record<OutputFormat, string> = {
    svg: '0',
    png: '1',
    dot: '2',
    json: '3',
    ast: '4',
    cst: '5',
};

const formatDecodeMap: Record<string, OutputFormat> = {
    '0': 'svg',
    '1': 'png',
    '2': 'dot',
    '3': 'json',
    '4': 'ast',
    '5': 'cst',
};

function encodeSectionStates(states: SectionStates): string {
    return [
        states.settingsCollapsed ? '1' : '0',
        states.editorCollapsed ? '1' : '0',
        states.outputCollapsed ? '1' : '0',
        states.executionCollapsed ? '1' : '0',
        sizeEncodeMap[states.editorSize],
        sizeEncodeMap[states.outputSize],
        sizeEncodeMap[states.executionSize],
        formatEncodeMap[states.outputFormat],
        states.fitToContainer ? '1' : '0',
    ].join('');
}

function decodeSectionStates(encoded: string): Partial<SectionStates> {
    if (!encoded || encoded.length !== 9) {
        return {};
    }

    return {
        settingsCollapsed: encoded[0] === '1',
        editorCollapsed: encoded[1] === '1',
        outputCollapsed: encoded[2] === '1',
        executionCollapsed: encoded[3] === '1',
        editorSize: sizeDecodeMap[encoded[4]] ?? 'medium',
        outputSize: sizeDecodeMap[encoded[5]] ?? 'medium',
        executionSize: sizeDecodeMap[encoded[6]] ?? 'medium',
        outputFormat: formatDecodeMap[encoded[7]] ?? 'svg',
        fitToContainer: encoded[8] === '1',
    };
}

async function generatePngFromSvg(svgContent: string): Promise<string | undefined> {
    if (!svgContent) {
        return undefined;
    }

    try {
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);

        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const image = new Image();

                image.onload = () => {
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');

                    if (!context) {
                        reject(new Error('Unable to obtain 2D canvas context'));
                        return;
                    }

                    canvas.width = image.width;
                    canvas.height = image.height;
                    context.drawImage(image, 0, 0);
                    resolve(canvas.toDataURL('image/png'));
                };

                image.onerror = () => {
                    reject(new Error('Unable to load SVG for PNG conversion'));
                };

                image.src = url;
            });

            return dataUrl;
        } finally {
            URL.revokeObjectURL(url);
        }
    } catch (error) {
        console.error('Failed to generate PNG preview from SVG:', error);
        return undefined;
    }
}

function convertToMachineData(machine: Machine): MachineData {
    return {
        title: machine.title || 'Untitled',
        nodes: machine.nodes.map((node) => ({
            name: node.name,
            type: node.type || 'State',
            parent:
                node.$container && node.$container.$type === 'Node'
                    ? (node.$container as any).name
                    : undefined,
            attributes: node.attributes.map((attr) => ({
                name: attr.name,
                type: attr.type?.base || 'string',
                value: attr.value ? String(attr.value) : '',
            })),
        })),
        edges: machine.edges.flatMap((edge) =>
            edge.segments.flatMap((segment) =>
                segment.target.map((targetRef) => ({
                    source: edge.source[0]?.ref?.name || '',
                    target: targetRef.ref?.name || '',
                    label:
                        segment.label.length > 0
                            ? segment.label[0].value.map((v) => v.text || '').join(' ')
                            : undefined,
                    type: segment.endType,
                }))
            )
        ),
    };
}

async function renderStaticOutputs(machine: Machine) {
    const graphvizResult = generateGraphviz(machine, 'playground.machine', undefined);
    const dotCode = graphvizResult.content;
    const jsonResult = generateJSON(machine);
    const jsonData = jsonResult.content;

    const tempDiv = window.document.createElement('div');
    await renderGraphviz(dotCode, tempDiv, `${Math.floor(Math.random() * 1_000_000_000)}`);
    const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

    return {
        svg: tempDiv.innerHTML,
        png: pngDataUrl,
        dot: dotCode,
        json: jsonData,
        machine,
        ast: machine,
    } satisfies OutputData;
}

export function usePlaygroundController(options: PlaygroundControllerOptions = {}) {
    const enableExecution = options.enableExecution ?? true;

    const [settings, setSettings] = useState(() => loadSettings());
    const [settingsCollapsed, setSettingsCollapsed] = useState(true);
    const [filesCollapsed, setFilesCollapsed] = useState(true);
    const [editorCollapsed, setEditorCollapsed] = useState(false);
    const [outputCollapsed, setOutputCollapsed] = useState(false);
    const [executionCollapsed, setExecutionCollapsed] = useState(true);
    const [editorSize, setEditorSize] = useState<SectionSize>('medium');
    const [outputSize, setOutputSize] = useState<SectionSize>('medium');
    const [executionSize, setExecutionSize] = useState<SectionSize>('medium');
    const [outputData, setOutputData] = useState<OutputData>({});
    const [executor, setExecutor] = useState<RailsExecutor | null>(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [currentMachineData, setCurrentMachineData] = useState<MachineData | null>(null);
    const [selectedExample, setSelectedExample] = useState<Example | null>(null);
    const [isDirty, setIsDirty] = useState(false);
    const [outputFormat, setOutputFormat] = useState<OutputFormat>('svg');
    const [fitToContainer, setFitToContainer] = useState(true);
    const [logLevel, setLogLevel] = useState<string>('info');

    const [openFiles, setOpenFiles] = useState<Array<{ path: string; content: string; name: string }>>([]);
    const [activeFileIndex, setActiveFileIndex] = useState(0);
    const activeFileIndexRef = useRef(0);
    const editorApiRef = useRef<PlaygroundEditorApi | null>(null);

    const [initialContent, setInitialContent] = useState('');

    useEffect(() => {
        activeFileIndexRef.current = activeFileIndex;
    }, [activeFileIndex]);

    const [fileService] = useState(() => {
        const vfs = new VirtualFileSystem('dygram-playground-vfs');
        vfs.loadFromLocalStorage();
        return new FileAccessService(vfs, { workingDir: 'examples' });
    });

    useEffect(() => {
        const hashParams = parseHashParams();
        let initialCode = '';
        let initialExample: Example | null = null;

        if (hashParams.content) {
            initialCode = hashParams.content;
            if (hashParams.example) {
                const example = getExampleByKey(hashParams.example);
                if (example) {
                    initialExample = example;
                }
            }
        } else if (hashParams.example) {
            const example = getExampleByKey(hashParams.example);
            if (example) {
                initialExample = example;
                initialCode = example.content;
            }
        }

        if (!initialCode) {
            const defaultExample = getDefaultExample();
            initialExample = defaultExample;
            initialCode = defaultExample.content;
        }

        if (hashParams.sections) {
            const sectionStates = decodeSectionStates(hashParams.sections);
            if (sectionStates.settingsCollapsed !== undefined) {
                setSettingsCollapsed(sectionStates.settingsCollapsed);
            }
            if (sectionStates.editorCollapsed !== undefined) {
                setEditorCollapsed(sectionStates.editorCollapsed);
            }
            if (sectionStates.outputCollapsed !== undefined) {
                setOutputCollapsed(sectionStates.outputCollapsed);
            }
            if (sectionStates.executionCollapsed !== undefined) {
                setExecutionCollapsed(sectionStates.executionCollapsed);
            }
            if (sectionStates.editorSize !== undefined) {
                setEditorSize(sectionStates.editorSize);
            }
            if (sectionStates.outputSize !== undefined) {
                setOutputSize(sectionStates.outputSize);
            }
            if (sectionStates.executionSize !== undefined) {
                setExecutionSize(sectionStates.executionSize);
            }
            if (sectionStates.outputFormat !== undefined) {
                setOutputFormat(sectionStates.outputFormat);
            }
            if (sectionStates.fitToContainer !== undefined) {
                setFitToContainer(sectionStates.fitToContainer);
            }
        }

        setSelectedExample(initialExample);
        setIsDirty(!!hashParams.content);

        if (!window.location.hash && initialExample) {
            updateHashParams({
                example: initialExample.name.toLowerCase().replace(/\s+/g, '-'),
            });
        }

        setInitialContent(initialCode);
    }, []);

    useEffect(() => {
        const currentSectionStates: SectionStates = {
            settingsCollapsed,
            editorCollapsed,
            outputCollapsed,
            executionCollapsed,
            editorSize,
            outputSize,
            executionSize,
            outputFormat,
            fitToContainer,
        };

        const hashParams = parseHashParams();
        const encodedSections = encodeSectionStates(currentSectionStates);
        updateHashParams({
            ...hashParams,
            sections: encodedSections,
        });
    }, [
        settingsCollapsed,
        editorCollapsed,
        outputCollapsed,
        executionCollapsed,
        editorSize,
        outputSize,
        executionSize,
        outputFormat,
        fitToContainer,
    ]);

    const registerEditorApi = useCallback((api: PlaygroundEditorApi) => {
        editorApiRef.current = api;
    }, []);

    const handleModelChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const newModel = e.target.value;
        setSettings((prev) => {
            const updated = { ...prev, model: newModel };
            saveSettings(updated.model, updated.apiKey);
            return updated;
        });
    }, []);

    const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newApiKey = e.target.value;
        setSettings((prev) => {
            const updated = { ...prev, apiKey: newApiKey };
            saveSettings(updated.model, updated.apiKey);
            return updated;
        });
    }, []);

    const toggleSettings = useCallback(() => {
        setSettingsCollapsed((prev) => !prev);
    }, []);

    const toggleFiles = useCallback(() => {
        setFilesCollapsed((prev) => !prev);
    }, []);

    const toggleEditor = useCallback(() => {
        setEditorCollapsed((prev) => !prev);
    }, []);

    const toggleOutput = useCallback(() => {
        setOutputCollapsed((prev) => !prev);
    }, []);

    const toggleExecution = useCallback(() => {
        setExecutionCollapsed((prev) => !prev);
    }, []);

    const handleEditorSizeChange = useCallback((size: SectionSize) => {
        setEditorSize(size);
    }, []);

    const handleOutputSizeChange = useCallback((size: SectionSize) => {
        setOutputSize(size);
    }, []);

    const handleExecutionSizeChange = useCallback((size: SectionSize) => {
        setExecutionSize(size);
    }, []);

    const handleOutputFormatChange = useCallback((format: OutputFormat) => {
        setOutputFormat(format);
    }, []);

    const handleFileSelect = useCallback(
        (path: string, content: string) => {
            const pathParts = path.split('/');
            const filename = pathParts[pathParts.length - 1];
            const name = filename
                .replace(/\.(dygram|mach)$/, '')
                .split('-')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' ');

            const existingIndex = openFiles.findIndex((f) => f.path === path);

            if (existingIndex >= 0) {
                setActiveFileIndex(existingIndex);
                const existingContent = openFiles[existingIndex].content;
                editorApiRef.current?.setContent(existingContent);
            } else {
                const newFile = { path, content, name };
                setOpenFiles((prev) => [...prev, newFile]);
                setActiveFileIndex(openFiles.length);
                editorApiRef.current?.setContent(content);
            }

            const category = pathParts.length > 1 ? pathParts[0] : 'root';
            const fileExample: Example = {
                path,
                name,
                title: name,
                category,
                filename,
                content,
            };

            setSelectedExample(fileExample);
            setIsDirty(false);

            updateHashParams({
                example: name.toLowerCase().replace(/\s+/g, '-'),
            });
        },
        [openFiles]
    );

    const handleTabSwitch = useCallback(
        (index: number) => {
            if (index >= 0 && index < openFiles.length) {
                setActiveFileIndex(index);
                editorApiRef.current?.setContent(openFiles[index].content);
            }
        },
        [openFiles]
    );

    const handleTabClose = useCallback(
        (index: number) => {
            const newFiles = openFiles.filter((_, i) => i !== index);
            setOpenFiles(newFiles);

            if (newFiles.length === 0) {
                setActiveFileIndex(0);
                editorApiRef.current?.setContent('');
            } else if (index === activeFileIndex) {
                const newIndex = index > 0 ? index - 1 : 0;
                setActiveFileIndex(newIndex);
                editorApiRef.current?.setContent(newFiles[newIndex].content);
            } else if (index < activeFileIndex) {
                setActiveFileIndex((prev) => Math.max(0, prev - 1));
            }
        },
        [openFiles, activeFileIndex]
    );

    const handleSaveFile = useCallback(async () => {
        if (openFiles.length === 0 || activeFileIndex >= openFiles.length) {
            return;
        }

        const activeFile = openFiles[activeFileIndex];

        try {
            await fileService.writeFile(activeFile.path, activeFile.content);
            const apiAvailable = fileService.isApiAvailable();
            if (apiAvailable) {
                alert(`Saved ${activeFile.name} to both API and VFS!`);
            } else {
                alert(`Saved ${activeFile.name} to virtual filesystem!`);
            }

            setIsDirty(false);
        } catch (error) {
            console.error('Error saving file:', error);
            alert(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }, [openFiles, activeFileIndex, fileService]);

    const handleDocumentChange = useCallback(
        async (code: string) => {
            setOpenFiles((prev) => {
                const currentIndex = activeFileIndexRef.current;
                if (prev.length > 0 && currentIndex < prev.length) {
                    const updated = [...prev];
                    updated[currentIndex] = {
                        ...updated[currentIndex],
                        content: code,
                    };
                    return updated;
                }
                return prev;
            });

            setIsDirty(true);

            if (selectedExample) {
                updateHashParams({
                    example: selectedExample.name.toLowerCase().replace(/\s+/g, '-'),
                    content: code,
                });
            } else {
                updateHashParams({
                    content: code,
                });
            }

            try {
                const services = createMachineServices(EmptyFileSystem);
                const parse = parseHelper<Machine>(services.Machine);
                const document = await parse(code);

                if (document.parseResult.parserErrors.length > 0) {
                    console.warn('Parse errors detected:', document.parseResult.parserErrors);
                }

                const model = document.parseResult.value as Machine;
                if (!model) {
                    console.warn('No machine model parsed');
                    return;
                }

                const outputs = await renderStaticOutputs(model);
                setOutputData(outputs);
            } catch (error) {
                console.error('Error updating diagram:', error);
            }
        },
        [selectedExample]
    );

    const updateRuntimeVisualization = useCallback(async (exec: RailsExecutor) => {
        try {
            const visualizer = new RuntimeVisualizer(exec);
            const runtimeDot = visualizer.generateRuntimeVisualization({
                showCurrentState: true,
                showVisitCounts: true,
                showExecutionPath: true,
                showRuntimeValues: true,
                mobileOptimized: true,
            });

            const tempDiv = window.document.createElement('div');
            await renderGraphviz(runtimeDot, tempDiv, `runtime-${Date.now()}`);
            const pngDataUrl = await generatePngFromSvg(tempDiv.innerHTML);

            setOutputData((prev) => ({
                ...prev,
                svg: tempDiv.innerHTML,
                png: pngDataUrl,
                dot: runtimeDot,
            }));
        } catch (error) {
            console.error('Error updating runtime visualization:', error);
        }
    }, []);

    const handleExecute = useCallback(async () => {
        if (!enableExecution) {
            return;
        }

        if (isExecuting) {
            console.warn('Execution already in progress');
            return;
        }

        if (!outputData.machine || !settings.apiKey) {
            console.error('No machine parsed or API key missing');
            return;
        }

        try {
            setIsExecuting(true);
            const machineData = convertToMachineData(outputData.machine);
            setCurrentMachineData(machineData);

            const exec = await RailsExecutor.create(machineData, {
                llm: {
                    provider: 'anthropic',
                    apiKey: settings.apiKey,
                    modelId: settings.model,
                },
            });

            setExecutor(exec);
            await exec.execute();
            await updateRuntimeVisualization(exec);
        } catch (error) {
            console.error('Execution error:', error);
        } finally {
            setIsExecuting(false);
        }
    }, [enableExecution, isExecuting, outputData.machine, settings, updateRuntimeVisualization]);

    const handleStep = useCallback(async () => {
        if (!enableExecution) {
            return;
        }

        if (!outputData.machine || !settings.apiKey) {
            console.error('No machine parsed or API key missing');
            return;
        }

        try {
            let exec = executor;

            if (!exec) {
                const machineData = convertToMachineData(outputData.machine);
                setCurrentMachineData(machineData);

                exec = await RailsExecutor.create(machineData, {
                    llm: {
                        provider: 'anthropic',
                        apiKey: settings.apiKey,
                        modelId: settings.model,
                    },
                });

                setExecutor(exec);
            }

            const continued = await exec.step();
            console.log('Execution logs:', exec.getLogs());
            await updateRuntimeVisualization(exec);

            if (!continued) {
                console.log('Machine execution complete');
            }
        } catch (error) {
            console.error('Step error:', error);
        }
    }, [enableExecution, executor, outputData.machine, settings, updateRuntimeVisualization]);

    const handleStop = useCallback(() => {
        if (!enableExecution) {
            return;
        }
        setIsExecuting(false);
    }, [enableExecution]);

    const handleReset = useCallback(async () => {
        if (!enableExecution) {
            return;
        }

        setExecutor(null);
        setIsExecuting(false);
        setCurrentMachineData(null);

        if (!outputData.machine) {
            return;
        }

        try {
            const outputs = await renderStaticOutputs(outputData.machine);
            setOutputData(outputs);
        } catch (error) {
            console.error('Error resetting to static diagram:', error);
        }
    }, [enableExecution, outputData.machine]);

    const handleLogLevelChange = useCallback(
        (level: string) => {
            setLogLevel(level);
            executor?.setLogLevel(level as any);
        },
        [executor]
    );

    return {
        settings,
        settingsCollapsed,
        filesCollapsed,
        editorCollapsed,
        outputCollapsed,
        executionCollapsed,
        editorSize,
        outputSize,
        executionSize,
        outputData,
        executor,
        isExecuting,
        currentMachineData,
        selectedExample,
        isDirty,
        outputFormat,
        fitToContainer,
        logLevel,
        openFiles,
        activeFileIndex,
        fileService,
        initialContent,
        registerEditorApi,
        handleModelChange,
        handleApiKeyChange,
        toggleSettings,
        toggleFiles,
        toggleEditor,
        toggleOutput,
        toggleExecution,
        handleEditorSizeChange,
        handleOutputSizeChange,
        handleExecutionSizeChange,
        handleOutputFormatChange,
        handleFileSelect,
        handleTabSwitch,
        handleTabClose,
        handleSaveFile,
        handleDocumentChange,
        handleExecute,
        handleStep,
        handleStop,
        handleReset,
        handleLogLevelChange,
        setFitToContainer,
    };
}

