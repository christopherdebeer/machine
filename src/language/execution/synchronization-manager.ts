/**
 * Synchronization Manager
 * Handles barriers, message passing, and path coordination
 */

import { ExecutionPath, PathState } from './types.js';

/**
 * Barrier state for synchronization
 */
interface Barrier {
    name: string;
    requiredPaths: Set<string>;
    waitingPaths: Set<string>;
    isReleased: boolean;
}

/**
 * Message channel for inter-path communication
 */
interface MessageChannel {
    name: string;
    messages: Array<{
        from: string;
        data: any;
        timestamp: number;
    }>;
}

/**
 * SynchronizationManager handles barriers and message passing between execution paths
 */
export class SynchronizationManager {
    private barriers: Map<string, Barrier>;
    private channels: Map<string, MessageChannel>;

    constructor() {
        this.barriers = new Map();
        this.channels = new Map();
    }

    /**
     * Register a barrier with a name
     */
    createBarrier(name: string, requiredPathIds: string[]): void {
        this.barriers.set(name, {
            name,
            requiredPaths: new Set(requiredPathIds),
            waitingPaths: new Set(),
            isReleased: false
        });
    }

    /**
     * Mark a path as waiting at a barrier
     * Returns true if barrier is now complete and should be released
     */
    waitAtBarrier(barrierName: string, pathId: string): boolean {
        const barrier = this.barriers.get(barrierName);
        if (!barrier) {
            throw new Error(`Barrier '${barrierName}' not found`);
        }

        if (barrier.isReleased) {
            return true; // Barrier already released
        }

        // Add path to waiting set
        barrier.waitingPaths.add(pathId);

        // Check if all required paths are now waiting
        const allWaiting = Array.from(barrier.requiredPaths).every(
            requiredPath => barrier.waitingPaths.has(requiredPath)
        );

        if (allWaiting) {
            barrier.isReleased = true;
            return true;
        }

        return false;
    }

    /**
     * Check if a barrier is complete and released
     */
    isBarrierReleased(barrierName: string): boolean {
        const barrier = this.barriers.get(barrierName);
        return barrier?.isReleased ?? false;
    }

    /**
     * Get paths waiting at a specific barrier
     */
    getWaitingPaths(barrierName: string): string[] {
        const barrier = this.barriers.get(barrierName);
        return barrier ? Array.from(barrier.waitingPaths) : [];
    }

    /**
     * Reset a barrier (for reusable barriers)
     */
    resetBarrier(barrierName: string): void {
        const barrier = this.barriers.get(barrierName);
        if (barrier) {
            barrier.waitingPaths.clear();
            barrier.isReleased = false;
        }
    }

    /**
     * Remove a barrier
     */
    removeBarrier(barrierName: string): void {
        this.barriers.delete(barrierName);
    }

    /**
     * Create a message channel
     */
    createChannel(name: string): void {
        if (!this.channels.has(name)) {
            this.channels.set(name, {
                name,
                messages: []
            });
        }
    }

    /**
     * Send a message to a channel
     */
    sendMessage(channelName: string, fromPathId: string, data: any): void {
        let channel = this.channels.get(channelName);
        if (!channel) {
            // Auto-create channel if it doesn't exist
            this.createChannel(channelName);
            channel = this.channels.get(channelName)!;
        }

        channel.messages.push({
            from: fromPathId,
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Receive messages from a channel
     * @param channelName - Name of the channel
     * @param since - Optional timestamp to get messages after
     * @param consume - If true, remove messages after reading
     */
    receiveMessages(
        channelName: string,
        since?: number,
        consume: boolean = false
    ): Array<{ from: string; data: any; timestamp: number }> {
        const channel = this.channels.get(channelName);
        if (!channel) {
            return [];
        }

        let messages = channel.messages;

        // Filter by timestamp if specified
        if (since !== undefined) {
            messages = messages.filter(m => m.timestamp > since);
        }

        // Consume messages if requested
        if (consume) {
            if (since !== undefined) {
                channel.messages = channel.messages.filter(m => m.timestamp <= since);
            } else {
                channel.messages = [];
            }
        }

        return messages;
    }

    /**
     * Get message count in a channel
     */
    getMessageCount(channelName: string): number {
        const channel = this.channels.get(channelName);
        return channel?.messages.length ?? 0;
    }

    /**
     * Clear all messages in a channel
     */
    clearChannel(channelName: string): void {
        const channel = this.channels.get(channelName);
        if (channel) {
            channel.messages = [];
        }
    }

    /**
     * Remove a channel
     */
    removeChannel(channelName: string): void {
        this.channels.delete(channelName);
    }

    /**
     * Get all active barriers
     */
    getActiveBarriers(): Array<{
        name: string;
        requiredPaths: string[];
        waitingPaths: string[];
        isReleased: boolean;
    }> {
        return Array.from(this.barriers.values()).map(b => ({
            name: b.name,
            requiredPaths: Array.from(b.requiredPaths),
            waitingPaths: Array.from(b.waitingPaths),
            isReleased: b.isReleased
        }));
    }

    /**
     * Get all channels
     */
    getChannels(): Array<{
        name: string;
        messageCount: number;
    }> {
        return Array.from(this.channels.values()).map(c => ({
            name: c.name,
            messageCount: c.messages.length
        }));
    }

    /**
     * Clear all synchronization state
     */
    clear(): void {
        this.barriers.clear();
        this.channels.clear();
    }
}
