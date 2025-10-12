/**
 * Standalone utility functions for LLM response processing
 */

import type { ModelResponse, TextBlock, ToolUseBlock } from './claude-client.js';

/**
 * Extract text content from a model response
 */
export function extractText(response: ModelResponse): string {
    const textBlocks = response.content.filter(
        (block): block is TextBlock => block.type === 'text'
    );
    return textBlocks.map(block => block.text).join('\n');
}

/**
 * Extract tool uses from a model response
 */
export function extractToolUses(response: ModelResponse): ToolUseBlock[] {
    return response.content.filter(
        (block): block is ToolUseBlock => block.type === 'tool_use'
    );
}
