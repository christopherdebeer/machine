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

interface FileGenerationResult {
    filePath: string;
    content: string;
}

// Base generator class
abstract class BaseGenerator {
    protected abstract fileExtension: string;

    constructor(protected machine: Machine, protected filePath: string, protected options: GeneratorOptions = {}) {}

    public generate(): string {
        const result = this.generateContent();
        return this.writeToFile(result);
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
            return [n, ...n.nodes.map(m => ({ ...m, type: n.name }))];
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

class MermaidGenerator extends BaseGenerator {
    protected fileExtension = 'md';

    protected generateContent(): FileGenerationResult {
        // First generate JSON as intermediate format
        const jsonGen = new JSONGenerator(this.machine, this.filePath, this.options);
        const jsonPath = jsonGen.generate();
        const jsonContent = fs.readFileSync(jsonPath, 'utf8');
        const machineJson: MachineJSON = JSON.parse(jsonContent);

        // Group nodes by type
        const groups = this.groupNodesByType(machineJson.nodes);
        const groupNames = Object.keys(groups);

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
  ${joinToNode(groupNames, (groupName) => {
            if (groupName === 'undefined') {
                // Handle ungrouped nodes directly
                const nodes = this.formatNodes(groups[groupName]);
                return nodes ? toString(nodes) : '';
            }
            // Wrap other groups in namespaces
            const nodes = this.formatNodes(groups[groupName]);
            if (!nodes) return '';
            return `namespace ${groupName} {
    ${toString(nodes)}
  }`;
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        })}
  ${joinToNode(machineJson.edges, edge => {
            return `${edge.source} --> ${edge.target}${edge.type ? ` : ${edge.type}` : ''}`
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        })}
\`\`\`
`.appendNewLineIfNotEmpty();

        return {
            filePath: this.filePath,
            content: toString(fileNode)
        };
    }

    private formatNodes(nodes: Node[]): string | undefined {
        const result = joinToNode(nodes, (node) => {
            if (nodes.find(n => n.name === node.type)) {
                return ''; // Skip nodes that are types themselves
            }

            const desc = node.attributes?.find(a => a.name === 'desc') || node.attributes?.find(a => a.name === 'prompt');
            const header = `class ${node.name}${desc ? `["${desc.value}"]` : ''}`;
            return `${header} {
      ${node.type ? `<<${node.type}>>` : ''}${node.attributes?.length ? ("\n   " + node.attributes?.filter(a => a.name !== 'desc' && a.name !== 'prompt').map(a => `${a.name}: ${a.value}`).join('\n')) : ''}
    }`;
        }, {
            separator: '\n',
            appendNewLineIfNotEmpty: true,
            skipNewLineAfterLastItem: true,
        });
        return result ? toString(result) : undefined;
    }

    private groupNodesByType(nodes: Node[]): Record<string, Node[]> {
        return nodes.reduce((acc: Record<string, Node[]>, item) => {
            const key = item.type || 'undefined';
            if (!acc[key]) {
                acc[key] = [];
            }
            acc[key].push(item);
            return acc;
        }, {});
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
            default:
                throw new Error(`Unsupported format: ${format}`);
        }
    }
}

// Public API
export function generateJSON(machine: Machine, filePath: string, destination: string | undefined): string {
    return GeneratorFactory.createGenerator('json', machine, filePath, { destination }).generate();
}

export function generateMermaid(machine: Machine, filePath: string, destination: string | undefined): string {
    return GeneratorFactory.createGenerator('mermaid', machine, filePath, { destination }).generate();
}
