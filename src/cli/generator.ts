import type { Attribute, Machine, Node } from '../language/generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';

// Common interfaces
interface GeneratorOptions {
    destination?: string;
    format?: string;
}

export interface FileGenerationResult {
    filePath: string;
    content: string;
}

// Base generator class
abstract class BaseGenerator {
    protected abstract fileExtension: string;

    constructor(protected machine: Machine, protected filePath: string, protected options: GeneratorOptions = {}) {}

    public generate(): FileGenerationResult {
        const result = this.generateContent();
        this.writeToFile(result);
        return result;
    }

    protected abstract generateContent(): FileGenerationResult;

    protected writeToFile(result: FileGenerationResult): string {
        const data = extractDestinationAndName(this.filePath, this.options.destination);
        const generatedFilePath = `${path.join(data.destination, data.name)}.${this.fileExtension}`;

        if (!fs.existsSync(data.destination)) {
            fs.mkdirSync(data.destination, { recursive: true });
        }
        fs.writeFileSync(generatedFilePath, result.content);
        return generatedFilePath;
    }

    protected formatAttributes(node: Node): string {
        if (!node.attributes || node.attributes.length === 0) {
            return '';
        }
        const result = joinToNode(node.attributes, (attr: Attribute) => {
            return `{"name": "${attr.name}", "type": "${attr.type}", "value":"${attr.value}"}`;
        }, {
            separator: ',',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });
        return toString(result);
    }
}

// JSON Generator
class JSONGenerator extends BaseGenerator {
    protected fileExtension = 'json';

    protected generateContent(): FileGenerationResult {
        const fileNode = expandToNode`{
  "title": "${this.machine.title}",
  "nodes": [
    ${joinToNode(this.machine.nodes, node => {
        return joinToNode([node].flatMap(n => {
            return [n, ...n.nodes.map(m => ({ ...m, type: n.name }))]
        }), n => {
            return `{"name": "${n.name}"${n.type ? `, "type": "${n.type}"` : ''}${n.attributes.length ? `, "attributes":[ ${this.formatAttributes(n)} ]` : ''} }`;
        }, {
            separator: ',',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        })
    }, {
        separator: ',',
        appendNewLineIfNotEmpty: true,
        skipNewLineAfterLastItem: true,
    })}
  ],
  "edges": [
    ${joinToNode(this.machine.edges, edge => {
        let lastInChain = edge.source?.ref?.name;
        return joinToNode(edge.segments, segment => `{"source": "${lastInChain}"${segment.label ? `, "type": "${segment.label}"` : ''}, "target": "${segment.target?.ref?.name}"}`, {
            separator: ',',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        })
    }, {
        separator: ',',
        appendNewLineIfNotEmpty: true,
        skipNewLineAfterLastItem: true,
    })}
  ]
}`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }
}

// Mermaid Generator
interface MachineJSON {
    title: string;
    nodes: Node[];
    edges: { source: string; type: string; target: string; }[];
}

interface TypeHierarchy {
    [key: string]: {
        nodes: Node[];
        subtypes: string[];
    };
}

class MermaidGenerator extends BaseGenerator {
    protected fileExtension = 'md';

    protected generateContent(): FileGenerationResult {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build type hierarchy
        const hierarchy = this.buildTypeHierarchy(machineJson.nodes);
        const rootTypes = this.getRootTypes(hierarchy);

        const fileNode = expandToNode`\`\`\`machine
${this.machine.$document?.textDocument.getText()}
\`\`\`

\`\`\`mermaid
---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: false
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
\`\`\`
`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }

    public getMermaidDefinition(): string {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson: MachineJSON = JSON.parse(jsonContent.content);

        // Build type hierarchy
        const hierarchy = this.buildTypeHierarchy(machineJson.nodes);
        const rootTypes = this.getRootTypes(hierarchy);

        return toString(expandToNode`---
title: "${this.machine.title}"
config:
  class:
    hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}`);
    }

    private buildTypeHierarchy(nodes: Node[]): TypeHierarchy {
        const hierarchy: TypeHierarchy = {};

        // Initialize hierarchy with all nodes
        nodes.forEach(node => {
            const type = node.type || 'undefined';
            if (!hierarchy[type]) {
                hierarchy[type] = { nodes: [], subtypes: [] };
            }
            hierarchy[type].nodes.push(node);
        });

        // Build subtype relationships
        nodes.forEach(node => {
            if (node.type && hierarchy[node.name]) {
                hierarchy[node.type].subtypes.push(node.name);
            }
        });

        return hierarchy;
    }

    private getRootTypes(hierarchy: TypeHierarchy): string[] {
        const allTypes = new Set(Object.keys(hierarchy));
        const subTypes = new Set(
            Object.values(hierarchy)
                .flatMap(h => h.subtypes)
        );
        return Array.from(allTypes)
            .filter(type => !subTypes.has(type))
            .filter(type => type !== 'undefined');
    }

    private generateTypeHierarchy(hierarchy: TypeHierarchy, types: string[], level = 0): string {
        const result = joinToNode(types, type => {
            const { nodes, subtypes } = hierarchy[type];
            const indent = '  '.repeat(level);

            // Generate namespace content
            const content = joinToNode(nodes, node => {
                const desc = node.attributes?.find(a => a.name === 'desc') || node.attributes?.find(a => a.name === 'prompt');
                const header = `class ${node.name}${desc ? `[\"${desc.value}\"]` : ''}`;

                // Format all attributes except desc/prompt for the class body
                const attributes = node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt') || [];
                const attributeLines = attributes.length > 0
                    ? attributes.map(a => `+${a.name} ${a.type ? `: ${a.type}` : ''} = ${a.value}`).join('\\n')
                    : '';

                return `${indent}  ${header} {
${indent}    ${node.type ? `<<${node.type}>>` : ''}${attributeLines ? '\n' + indent + '    ' + attributeLines : ''}
${indent}  }`;
            }, {
                separator: '\n',
                appendNewLineIfNotEmpty: true,
                skipNewLineAfterLastItem: true,
            });

            // Generate subtype hierarchy
            const subtypeContent = subtypes.length > 0 ?
                this.generateTypeHierarchy(hierarchy, subtypes, level + 1) : '';

            // Only create namespace if there are nodes or subtypes
            if (nodes.length <= 1 && subtypes.length === 0) {
                return '';
            }

            return toString(expandToNode`${indent}namespace ${type} {
${toString(content)}${subtypeContent ? '\n' + toString(subtypeContent) : ''}
${indent}}`);
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });

        return toString(result);
    }

    private generateEdges(edges: { source: string; type: string; target: string; }[]): string {
        const result = joinToNode(edges, edge => {
            return `  ${edge.source} --> ${edge.target}${edge.type ? ` : ${edge.type}` : ''}`
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });
        return toString(result);
    }
}

const escapeHTML = (str : string) : string => str.replace(/[&<>'"]/g, 
    tag => {
        const tags : {[key: string]: string} = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
          };
        return tags[tag];
    });

// HTML Generator
class HTMLGenerator extends BaseGenerator {
    protected fileExtension = 'html';

    protected generateContent(): FileGenerationResult {
        const webExecutorPath = path.join(path.dirname(this.filePath), '..', 'out', 'extension', 'web', 'machine-executor-web.js');
        const mermaidGen = new MermaidGenerator(this.machine, this.filePath, this.options);
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonContent = jsonGen.generate();
        const machineJson = jsonContent.content;
        const mermaidDefinition = escapeHTML(mermaidGen.getMermaidDefinition());

        const fileNode = expandToNode`<!DOCTYPE html>
<html lang="en">
<head>
    <meta name="system" content="dygram">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Bundled machine executor -->
    <script type="module">${fs.readFileSync(webExecutorPath, 'utf-8')}</script>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

        // Initialize mermaid with custom settings
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'loose',
            logLevel: 0,
            htmlLabels: true
        });

        // Function to toggle dark/light mode
        window.toggleTheme = function() {
            const isDark = document.body.classList.toggle('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            location.reload(); // Refresh to update the diagram
        }

        // Function to download the diagram as SVG
        window.downloadSVG = function() {
            const svg = document.querySelector('#diagram svg');
            const serializer = new XMLSerializer();
            const source = serializer.serializeToString(svg);
            const blob = new Blob([source], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = '${this.machine.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Function to execute the machine
        window.executeMachineProgram = function() {
            const machineData = ${machineJson};
            const executor = new MachineExecutor(machineData);
            const result = executor.execute();

            // Display execution results
            const resultDiv = document.getElementById('executionResult');
            resultDiv.innerHTML = '<h3>Execution Path:</h3>';
            const pathList = document.createElement('ul');
            result.history.forEach(step => {
                const li = document.createElement('li');
                li.textContent = \`\${step.from} --(\${step.transition})--> \${step.to}\`;
                pathList.appendChild(li);
            });
            resultDiv.appendChild(pathList);

            // Show the results section
            document.getElementById('results').style.display = 'block';
        }

        // Function to download the diagram as PNG
        window.downloadPNG = function() {
            const svg = document.querySelector('#diagram svg');
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const loader = new Image();

            loader.onload = function() {
                canvas.width = loader.width;
                canvas.height = loader.height;
                ctx.drawImage(loader, 0, 0);
                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = '${this.machine.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_diagram.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

            const serializer = new XMLSerializer();
            const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializer.serializeToString(svg));
            loader.src = source;
        }

        // Set initial theme
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme') || 'light';
            if (savedTheme === 'dark') {
                document.body.classList.add('dark-theme');
            }
        });
        const uniqueId = "mermaid-svg-" + Date.now();
        const content = document.querySelector('.mermaid');
        const code = content.textContent.trim();
        console.log(code);
        let Diagram = window.Diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
        console.log(Diagram)
        const svg = document.createElement('svg')
        const render = await mermaid.render(uniqueId, code);
        console.log("Render", render);
        const container = document.querySelector('#diagram');
        container.innerHTML = "";
        container.appendChild(svg)
        svg.outerHTML = render.svg
        render.bindFunctions?.(container);

    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            margin: 0;
            padding: 20px;
            transition: background-color 0.3s, color 0.3s;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }

        body.dark-theme {
            background-color: #1a1a1a;
            color: #ffffff;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            display: flex;
            gap: 10px;
            z-index: 1000;
        }

        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
        }

        body:not(.dark-theme) button {
            background-color: #f0f0f0;
            color: #333;
        }

        body:not(.dark-theme) button:hover {
            background-color: #e0e0e0;
        }

        body.dark-theme button {
            background-color: #333;
            color: #fff;
        }

        body.dark-theme button:hover {
            background-color: #444;
        }

        .title {
            margin-bottom: 20px;
            font-size: 24px;
            font-weight: bold;
        }

        #diagram {
            flex-grow: 1;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .dark-theme #diagram {
            filter: invert(1) hue-rotate(180deg);
        }

        .dark-theme #diagram [fill="white"] {
            fill: black;
        }

        #results {
            display: none;
            margin-top: 20px;
            padding: 20px;
            border-radius: 4px;
        }

        body:not(.dark-theme) #results {
            background-color: #f5f5f5;
        }

        body.dark-theme #results {
            background-color: #2d2d2d;
        }
    </style>
</head>
<body>
    <div class="controls">
        <button onclick="toggleTheme()">Toggle Theme</button>
        <button onclick="downloadSVG()">Download SVG</button>
        <button onclick="downloadPNG()">Download PNG</button>
        <button onclick=\"executeMachineProgram()\">Execute Machine</button>
    </div>
    <div class="title">${this.machine.title}</div>
    <div id="diagram">
        <code class="mermaid">${mermaidDefinition}</code>
    </div>
    <div id=\"results\">
        <h2>Execution Results</h2>
        <div id=\"executionResult\"></div>
    </div>
</body>
</html>`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }
}

// Generator Factory
class GeneratorFactory {
    static createGenerator(format: string, machine: Machine, filePath: string, options: GeneratorOptions = {}): BaseGenerator {
        switch (format.toLowerCase()) {
            case 'json':
                return new JSONGenerator(machine, filePath, options);
            case 'mermaid':
                return new MermaidGenerator(machine, filePath, options);
            case 'html':
                return new HTMLGenerator(machine, filePath, options);
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
}

// Public API
export function generateJSON(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('json', machine, filePath, { destination }).generate();
}

export function generateMermaid(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('mermaid', machine, filePath, { destination }).generate();
}

export function generateHTML(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('html', machine, filePath, { destination }).generate();
}
