import { SemanticTokenTypes } from 'vscode-languageserver';
import { AstNode, isReference } from 'langium';
import {
    isAttribute,
    isEdge,
    isNode,
    isEdgeSegment
} from './generated/ast.js';
import { AbstractSemanticTokenProvider, SemanticTokenAcceptor } from 'langium/lsp';

export class MachineSemanticTokenProvider extends AbstractSemanticTokenProvider {
    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isNode(node)) {
            // Highlight node type as class
            if (node.type) {
                acceptor({
                    node: node,
                    property: 'type',
                    type: SemanticTokenTypes.class
                });
            }
            // Highlight node name as variable
            acceptor({
                node: node,
                property: 'name',
                type: SemanticTokenTypes.variable
            });
        }
        else if (isAttribute(node)) {
            // Highlight attribute name as property
            acceptor({
                node: node,
                property: 'name',
                type: SemanticTokenTypes.property
            });
            // Highlight attribute type as type
            if (node.type) {
                acceptor({
                    node: node,
                    property: 'type',
                    type: SemanticTokenTypes.type
                });
            }
        }
        else if (isEdge(node)) {
            // Highlight source reference as variable
            if (node.source) {
                acceptor({
                    node: node,
                    property: 'source',
                    type: SemanticTokenTypes.variable
                });
            }
        }
        else if (isEdgeSegment(node)) {
            // Highlight target reference as variable
            if (node.target) {
                acceptor({
                    node: node,
                    property: 'target',
                    type: SemanticTokenTypes.variable
                });
            }
            // Highlight label as string if it's a string literal
            if (node.label && !isReference(node.label)) {
                acceptor({
                    node: node,
                    property: 'label',
                    type: SemanticTokenTypes.string
                });
            }
        }
    }
}
