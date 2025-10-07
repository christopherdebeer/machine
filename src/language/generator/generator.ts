import type { EdgeType, Machine, Node } from '../generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from '../../cli/cli-util.js';
import { Edge, MachineJSON } from '../machine-module.js';

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
        if (this.options.destination) this.writeToFile(result);
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
}

// JSON Generator
class JSONGenerator extends BaseGenerator {
    protected fileExtension = 'json';

    protected generateContent(): FileGenerationResult {
        // Create a serializable object representation of the machine
        const machineObject : MachineJSON = {
            title: this.machine.title,
            nodes: this.serializeNodes(),
            edges: this.serializeEdges()
        };

        console.log(JSON.stringify(machineObject))

        try {
            const str = JSON.stringify(machineObject, null, 2)
            console.log(str)
        } catch(err) {
            // console.error(err)
            throw new Error(`Failed to serialize machine to JSON: ${err}`)
        }

        return {
            filePath: this.filePath,
            content: JSON.stringify(machineObject, null, 2)
        };
    }

    private serializeNodes(): any[] {
        // Flatten and transform nodes recursively
        const flattenNode = (node: Node, parentName?: string): any[] => {
            const baseNode = {
                name: node.name,
                type: parentName || node.type,
                attributes: this.serializeAttributes(node)
            };

            // Recursively flatten child nodes
            const childNodes = node.nodes.flatMap(child =>
                flattenNode(child, node.name)
            );

            return [baseNode, ...childNodes];
        };

        return this.machine.nodes.flatMap(node => flattenNode(node));
    }

    private serializeAttributes(node: Node): any[] {
        return node.attributes?.map(attr => {
            // Extract the actual value from the AttributeValue
            let value: any = attr.value?.value;

            // If value property doesn't exist but we have a CST node, extract text from CST
            if (value === undefined && attr.value?.$cstNode) {
                const text = attr.value.$cstNode.text;
                // Try to parse the text value
                value = text;
            }

            // If value is an array, use the first element (or keep as array if needed)
            // If it's a single value, use it directly
            if (Array.isArray(value) && value.length === 1) {
                value = value[0];
            }
            return {
                name: attr.name,
                type: attr.type,
                value: value
            };
        }) || [];
    }

    private serializeEdges(): any[] {
        return this.machine.edges.flatMap(edge => {
            const sources = edge.source.map(s => s.ref?.name);
            let currentSources = sources;

            return edge.segments.flatMap(segment => {
                const targets = segment.target.map(t => t.ref?.name);
                const edgeValue = this.serializeEdgeValue(segment.label);
                const edges = currentSources.flatMap(source =>
                    targets.map(target => ({
                        source,
                        target,
                        value: edgeValue,
                        attributes: edgeValue  // Keep for backward compatibility
                    })).filter(e => e.source && e.target)
                );
                currentSources = targets; // Update sources for next segment
                return edges;
            });
        });
    }

    private serializeEdgeValue(labels?: EdgeType[]): Record<string, any> | undefined {
        if (!labels || labels.length === 0) {
            return undefined;
        }
        
        console.log('🔍 serializeEdgeValue called with labels:', labels);
        
        const value: Record<string, any> = {};
        labels.forEach((label, idx) => {
            console.log(`🏷️ Processing label ${idx}:`, label);
            console.log(`🏷️ Label value array:`, label.value);
            
            // Check if the label itself has text content in its CST node
            if (label.$cstNode && 'text' in label.$cstNode) {
                const labelText = label.$cstNode.text;
                console.log(`🏷️ Label CST text:`, labelText);
                
                // For simple labels, the CST text is just the label name (e.g., "feeds", "stores")
                // For complex patterns, try to extract from full syntax
                if (labelText && labelText.trim()) {
                    // Check if it's a simple label (just the text)
                    if (!labelText.includes('-') && !labelText.includes('=') && !labelText.includes('>')) {
                        console.log(`✅ Found simple label:`, labelText);
                        value['text'] = labelText.trim();
                    } else {
                        // Try to extract from complex patterns like "-feeds->" or "--compute-->" or "=finalize=>"
                        const match = labelText.match(/^-+([^-]+)-+>?$|^=+([^=]+)=+>?$/);
                        if (match) {
                            const extractedLabel = match[1] || match[2];
                            console.log(`✅ Extracted label from pattern:`, extractedLabel);
                            value['text'] = extractedLabel;
                        }
                    }
                }
            }
            
            // Also process the value array as before
            label.value.forEach((attr, attrIdx) => {
                console.log(`📝 Processing attribute ${attrIdx}:`, attr);
                console.log(`📝 Attribute properties:`, { name: attr.name, text: attr.text, value: attr.value });
                
                if (!attr.name && attr.text) {
                    // Extract the actual string value, removing quotes if present
                    let textValue = attr.text;
                    
                    // Handle AST objects for text values
                    if (textValue && typeof textValue === 'object' && '$cstNode' in textValue) {
                        const astNode = textValue as any;
                        if (astNode.$cstNode && 'text' in astNode.$cstNode) {
                            textValue = astNode.$cstNode.text;
                        }
                    }
                    
                    if (typeof textValue === 'string') {
                        textValue = textValue.replace(/^["']|["']$/g, '');
                    }
                    
                    console.log(`✅ Found text value:`, textValue);
                    value['text'] = textValue;
                } else if (attr.name && attr.value) {
                    // Extract the actual value, handling nested value property
                    let attrValue = attr.value;
                    
                    // Handle AST objects for attribute values
                    if (attrValue && typeof attrValue === 'object' && '$cstNode' in attrValue) {
                        const astNode = attrValue as any;
                        if (astNode.$cstNode && 'text' in astNode.$cstNode) {
                            attrValue = astNode.$cstNode.text;
                        } else if ('value' in astNode) {
                            attrValue = astNode.value;
                        }
                    } else if (typeof attrValue === 'object' && attrValue !== null && 'value' in attrValue) {
                        attrValue = (attrValue as any).value;
                    }
                    
                    if (typeof attrValue === 'string') {
                        attrValue = attrValue.replace(/^["']|["']$/g, '');
                    }
                    
                    console.log(`✅ Found named attribute:`, { name: attr.name, value: attrValue });
                    value[attr.name] = attrValue;
                }
            });
        });

        console.log('🎯 Final edge value:', value);
        return Object.keys(value).length > 0 ? value : undefined;
    }
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

        const fileNode = expandToNode`---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
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
        console.log('buildTypeHierarchy', hierarchy)
        return hierarchy;
    }

    private getRootTypes(hierarchy: TypeHierarchy): string[] {
        const allTypes = new Set(Object.keys(hierarchy));
        const subTypes = new Set(
            Object.values(hierarchy)
                .flatMap(h => h.subtypes)
        );
        console.log('------------', Array.from(allTypes), Array.from(subTypes))
        return Array.from(allTypes)
            .filter(type => !subTypes.has(type))
            // .filter(type => type !== 'undefined');
    }

    private generateTypeHierarchy(hierarchy: TypeHierarchy, types: string[], level = 0): string {
        const result = joinToNode(types, type => {
            const { nodes, subtypes } = hierarchy[type];
            const indent = '  '.repeat(level);

            console.log("generateTypeHierarchy", types, type)

            // Generate namespace content
            const content = joinToNode(nodes, node => {
                const desc = node.attributes?.find(a => a.name === 'desc') || node.attributes?.find(a => a.name === 'prompt');
                let displayValue: any = desc?.value;
                if (desc && typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
                }
                const header = `class ${node.name}${desc ? `["${displayValue}"]` : ''}`;

                // Format all attributes except desc/prompt for the class body
                const attributes = node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt') || [];
                const attributeLines = attributes.length > 0
                    ? attributes.map(a => {
                        // Extract the actual value from the attribute
                        let displayValue = a.value?.value ?? a.value;
                        // Remove quotes from string values for display
                        if (typeof displayValue === 'string') {
                            displayValue = displayValue.replace(/^["']|["']$/g, '');
                        }
                        return `+${a.name}${a.type ? ` : ${a.type}` : ''} = ${displayValue}`;
                    }).join('\n')
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

            if (type === 'undefined' || nodes.length === 1) {
                return toString(expandToNode`${toString(content)}${subtypeContent ? "\n" + toString(subtypeContent) : ''}`)
            }

            return toString(expandToNode`${indent}namespace ${type}s {
${toString(content)}${subtypeContent ? '\n' + toString(subtypeContent) : ''}
${indent}}`);
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });

        return toString(result);
    }

    private generateEdges(edges: Edge[]): string {
        
        const result = joinToNode(edges, edge => {
            let labelJSON = ``;
            Object.keys(edge.value || {}).forEach((key, idx) => {
                if (key === 'text') {
                    labelJSON += `${edge.value[key]}`;
                } else {
                    labelJSON += `${idx > 0 ? ', ' : ''}${key}=${edge.value[key]}`;
                }
            });
            return `  ${edge.source} --> ${edge.target}${labelJSON ? ` : ${labelJSON}` : ''}`
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });
        return toString(result);
    }
}

class MarkdownGenerator extends BaseGenerator {
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
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
\`\`\`

\`\`\`raw
---
"title": "${this.machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${toString(this.generateTypeHierarchy(hierarchy, rootTypes))}
  ${toString(this.generateEdges(machineJson.edges))}
\`\`\`

\`\`\`raw
${JSON.stringify(machineJson, null, 2)}
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
                let displayValue: any = desc?.value;
                if (desc && typeof displayValue === 'string') {
                    displayValue = displayValue.replace(/^["']|["']$/g, ''); // Remove outer quotes
                }
                const header = `class ${node.name}${desc ? `["${displayValue}"]` : ''}`;

                // Format all attributes except desc/prompt for the class body
                const attributes = node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt') || [];
                const attributeLines = attributes.length > 0
                    ? attributes.map(a => {
                        // Extract the actual value from the attribute
                        let displayValue = a.value?.value ?? a.value;
                        // Remove quotes from string values for display
                        if (typeof displayValue === 'string') {
                            displayValue = displayValue.replace(/^["']|["']$/g, '');
                        }
                        return `+${a.name}${a.type ? ` : ${a.type}` : ''} = ${displayValue}`;
                    }).join('\n')
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

    private generateEdges(edges: Edge[]): string {
        
        const result = joinToNode(edges, edge => {
            let labelJSON = ``;
            Object.keys(edge.value || {}).forEach((key, idx) => {
                if (key === 'text') {
                    labelJSON += `${edge.value[key]}`;
                } else {
                    labelJSON += `${idx > 0 ? ', ' : ''}${key}=${edge.value[key]}`;
                }
            });
            return `  ${edge.source} --> ${edge.target}${labelJSON ? ` : ${labelJSON}` : ''}`
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
            result.history?.forEach(step => {
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
            case 'markdown':
                return new MarkdownGenerator(machine, filePath, options);
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

export function generateMarkdown(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('markdown', machine, filePath, { destination }).generate();
}

export function generateHTML(machine: Machine, filePath: string, destination: string | undefined): FileGenerationResult {
    return GeneratorFactory.createGenerator('html', machine, filePath, { destination }).generate();
}
