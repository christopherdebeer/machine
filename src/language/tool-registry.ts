/**
 * Centralized tool registry and execution manager
 *
 * This class provides a unified interface for registering and executing tools,
 * replacing scattered dispatch logic across multiple files.
 */

import type { ToolDefinition } from './claude-client.js';

/**
 * Tool handler function signature
 */
export type ToolHandler = (name: string, input: any) => Promise<any>;

/**
 * Tool filter function for querying available tools
 */
export type ToolFilter = (tool: ToolDefinition) => boolean;

/**
 * Centralized tool registry and execution manager
 */
export class ToolRegistry {
    private staticTools = new Map<string, ToolDefinition>();
    private dynamicHandlers = new Map<string | RegExp, ToolHandler>();

    /**
     * Register a static tool with fixed definition
     * @param tool The tool definition
     * @param handler The function to execute the tool
     */
    registerStatic(tool: ToolDefinition, handler: ToolHandler): void {
        this.staticTools.set(tool.name, tool);
        this.dynamicHandlers.set(tool.name, handler);
    }

    /**
     * Register a dynamic tool handler (e.g., for transition_to_* pattern)
     * @param pattern String prefix or RegExp to match tool names
     * @param handler The function to execute matching tools
     */
    registerDynamic(pattern: string | RegExp, handler: ToolHandler): void {
        this.dynamicHandlers.set(pattern, handler);
    }

    /**
     * Unregister a tool or pattern
     * @param nameOrPattern Tool name or pattern to unregister
     */
    unregister(nameOrPattern: string | RegExp): void {
        this.staticTools.delete(nameOrPattern as string);
        this.dynamicHandlers.delete(nameOrPattern);
    }

    /**
     * Execute a tool by name
     * @param name The tool name
     * @param input The tool input
     * @returns The tool execution result
     * @throws Error if tool not found or execution fails
     */
    async executeTool(name: string, input: any): Promise<any> {
        // Check static tools first
        if (this.staticTools.has(name)) {
            const handler = this.dynamicHandlers.get(name);
            if (!handler) {
                throw new Error(`Handler not found for tool: ${name}`);
            }
            return await handler(name, input);
        }

        // Check dynamic patterns
        for (const [pattern, handler] of this.dynamicHandlers) {
            if (this.matches(name, pattern)) {
                return await handler(name, input);
            }
        }

        throw new Error(`Tool not found: ${name}`);
    }

    /**
     * Get all available tools, optionally filtered
     * @param filter Optional filter function
     * @returns Array of tool definitions
     */
    getAvailableTools(filter?: ToolFilter): ToolDefinition[] {
        const tools = Array.from(this.staticTools.values());
        if (filter) {
            return tools.filter(tool => filter(tool));
        }
        return tools;
    }

    /**
     * Check if a tool name is registered (static or dynamic pattern)
     * @param name Tool name to check
     * @returns True if the tool can be executed
     */
    hasTool(name: string): boolean {
        if (this.staticTools.has(name)) {
            return true;
        }

        for (const pattern of this.dynamicHandlers.keys()) {
            if (this.matches(name, pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if a tool name matches a pattern
     * @param name Tool name
     * @param pattern String prefix or RegExp pattern
     * @returns True if the name matches the pattern
     */
    private matches(name: string, pattern: string | RegExp): boolean {
        if (typeof pattern === 'string') {
            return name === pattern || name.startsWith(pattern);
        }
        return pattern.test(name);
    }

    /**
     * Clear all registered tools and handlers
     */
    clear(): void {
        this.staticTools.clear();
        this.dynamicHandlers.clear();
    }

    /**
     * Get count of registered static tools
     */
    getStaticToolCount(): number {
        return this.staticTools.size;
    }

    /**
     * Get count of registered dynamic handlers
     */
    getDynamicHandlerCount(): number {
        return this.dynamicHandlers.size;
    }

    /**
     * Get all registered patterns (for debugging)
     * @returns Array of registered patterns
     */
    getRegisteredPatterns(): Array<string | RegExp> {
        return Array.from(this.dynamicHandlers.keys());
    }

    /**
     * Get diagnostic information about the registry
     * @returns Diagnostic information including counts and lists
     */
    getDiagnostics(): {
        staticToolCount: number;
        dynamicHandlerCount: number;
        patterns: Array<string | RegExp>;
        staticTools: string[];
    } {
        return {
            staticToolCount: this.staticTools.size,
            dynamicHandlerCount: this.dynamicHandlers.size,
            patterns: this.getRegisteredPatterns(),
            staticTools: Array.from(this.staticTools.keys())
        };
    }
}
