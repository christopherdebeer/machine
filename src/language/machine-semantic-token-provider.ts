import { SemanticTokenTypes } from 'vscode-languageserver';
import { AstNode } from 'langium';
import { isNode } from './generated/ast.js';
import { AbstractSemanticTokenProvider, SemanticTokenAcceptor } from 'langium/lsp';

export class MachineSemanticTokenProvider extends AbstractSemanticTokenProvider {

    protected highlightElement(node: AstNode, acceptor: SemanticTokenAcceptor): void {
        if (isNode(node)) {
            acceptor({
                node,
                keyword: 'asda',
                type: SemanticTokenTypes.class
            });
        }
    }

}