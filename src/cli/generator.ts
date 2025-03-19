import type { Attribute, Machine, Node } from '../language/generated/ast.js';
import { expandToNode, joinToNode, toString } from 'langium/generate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractDestinationAndName } from './cli-util.js';


function attributes(node: Node) {
    if (!node.attributes || node.attributes.length === 0) {
        return '';
    }
    return joinToNode(node.attributes, (attr : Attribute) => {
        return `{"name": "${attr.name}", "type": "${attr.type}", "value":"${attr.value}"}`;
    }, {
        separator: ',', 
        appendNewLineIfNotEmpty: true,
        skipNewLineAfterLastItem: true,
    })?.contents || '';
}

export function generateJSON(machine: Machine, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.json`;

    const fileNode = expandToNode`{
  "title": "${machine.title}",
  "nodes": [
    ${joinToNode(machine.nodes, node => {
        return joinToNode([node].flatMap( n => {
            return [n, ...n.nodes.map( m => ({...m, type: n.name}))];
        }), n => {
            return `{"name": "${n.name}"${n.type ? `, "type": "${n.type}"` : ''}${n.attributes.length ? `, "attributes":[ ${attributes(n)} ]` : ''} }`;
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
    ${joinToNode(machine.edges, edge => {
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

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}


interface MachineJSON {
    title: string;
    nodes: Node[];
    edges: { source: string, type: string, target: string }[];
}

// function _wrapGroupInNamespace(content: string, group?: string, ) {
//     if (!group || group === 'undefined') {
//         return content;
//     }
//     return `namespace ${group} {
//     ${content}
//   }`;
// }



export function generateMermaid(machine: Machine, filePath: string, destination: string | undefined): string {
    const data = extractDestinationAndName(filePath, destination);
    const generatedFilePath = `${path.join(data.destination, data.name)}.md`;
    const json = generateJSON(machine, filePath, destination);
    const jsonContent = fs.readFileSync(json, 'utf8');
    const machineJson : MachineJSON = JSON.parse(jsonContent);
    const groups = machineJson.nodes.reduce((acc: Record<string, Node[]>, item) => {
        const key = item.type || 'undefined';
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(item);
        return acc;
      }, {});
    const groupNames = Object.keys(groups);
    const fileNode = expandToNode`\`\`\`machine
${machine.$document?.textDocument.getText()}
\`\`\`

\`\`\`mermaid
---
"title": "${machine.title}"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
  ${joinToNode(groupNames, (groupName) => {
    const res = joinToNode( groups[groupName], (node) => {
        if (groups[node.name]) {
            return '';
        }

        const desc = node.attributes?.find( a => a.name === 'desc') || node.attributes?.find( a => a.name === 'prompt');
        const header = `class ${node.name}${ desc ? `["${desc.value}"]` : ''}`;
        const clsRes =  `${header} {
      ${node.type ? `<<${node.type}>>` : ''}${node.attributes?.length ? ("\n   " + node.attributes?.filter( a => a.name !== 'desc' && a.name !== 'prompt').map( a => `${a.name}: ${a.value}`).join('\n')) : ''}
    }`;
        return clsRes;
    }, {
        separator: '', 
        appendNewLineIfNotEmpty: true,
        skipNewLineAfterLastItem: true,
    });
    return res;
  }, {
    separator: '', 
    appendNewLineIfNotEmpty: true,
    skipNewLineAfterLastItem: true,
})}
  ${joinToNode(machineJson.edges, edge => {
        return `${edge.source} --> ${edge.target}${ edge.type ? ` : ${edge.type}` : ''}`
    }, {
        separator: '', 
        appendNewLineIfNotEmpty: true,
        skipNewLineAfterLastItem: true,
    })}
\`\`\`
`.appendNewLineIfNotEmpty();

    if (!fs.existsSync(data.destination)) {
        fs.mkdirSync(data.destination, { recursive: true });
    }
    fs.writeFileSync(generatedFilePath, toString(fileNode));
    return generatedFilePath;
}
