/**
 * Turn-Level Execution Types
 *
 * Types for fine-grained turn-by-turn execution control within agent nodes.
 * Enables stepping through individual LLM invocations and tool executions.
 */

import type { ToolDefinition, ToolExecutionResult } from './runtime-types.js';

/**
 * Conversation state for resumable turn execution
 */
export interface ConversationState {
    /** Message history for the conversation */
    messages: Array<{
        role: 'user' | 'assistant';
        content: any;
    }>;
    
    /** Available tools for this conversation */
    tools: ToolDefinition[];
    
    /** Accumulated tool executions across all turns */
    toolExecutions: ToolExecutionResult[];
    
    /** Accumulated text output across all turns */
    accumulatedText: string;
}

/**
 * Result of executing a single turn
 */
export interface TurnResult {
    /** Updated conversation state (for resumption) */
    conversationState: ConversationState;
    
    /** Tool executions from this turn */
    toolExecutions: ToolExecutionResult[];
    
    /** Text output from this turn */
    text: string;
    
    /** Whether the conversation is complete */
    isComplete: boolean;
    
    /** Next node to transition to (if any) */
    nextNode?: string;
    
    /** Whether a dynamic tool was constructed this turn */
    dynamicToolConstructed: boolean;
}

/**
 * Turn state stored in ExecutionState
 */
export interface TurnState {
    /** Path ID this turn belongs to */
    pathId: string;
    
    /** Node name being executed */
    nodeName: string;
    
    /** Current conversation state */
    conversationState: ConversationState;
    
    /** Turn count (0-indexed) */
    turnCount: number;
    
    /** Whether we're waiting for next turn */
    isWaitingForTurn: boolean;
    
    /** System prompt that started this conversation */
    systemPrompt: string;
    
    /** Model ID being used */
    modelId?: string;
}

/**
 * Result of a turn-level step operation
 */
export interface TurnStepResult {
    /** Status of the turn step */
    status: 'continue' | 'complete' | 'waiting' | 'error';
    
    /** Updated turn state (if continuing) */
    turnState?: TurnState;
    
    /** Next node to transition to (if complete) */
    nextNode?: string;
    
    /** Error message (if error) */
    error?: string;
    
    /** Tool executions from this turn */
    toolExecutions: ToolExecutionResult[];
    
    /** Text output from this turn */
    text: string;
}

/**
 * Configuration for turn-level execution
 */
export interface TurnExecutionConfig {
    /** Pause after each turn (for inspection) */
    pauseOnTurn?: boolean;
    
    /** Pause after each tool execution */
    pauseOnTool?: boolean;
    
    /** Maximum turns per conversation (safety limit) */
    maxTurns?: number;
}
