/**
 * Centralized File Extension Configuration
 *
 * This module provides a single source of truth for DyGram file extensions.
 * Extensions are defined in langium-config.json and accessed via generated metadata.
 */

import { MachineLanguageMetaData } from './generated/module.js';

/**
 * Get the list of supported file extensions for DyGram files.
 * These extensions are configured in langium-config.json.
 *
 * @returns Array of file extensions (e.g., ['.dy', '.mach', '.dy'])
 */
export function getFileExtensions(): string[] {
    return MachineLanguageMetaData.fileExtensions;
}

/**
 * Get the primary/preferred file extension for DyGram files.
 *
 * @returns The first extension from the list (e.g., '.dy')
 */
export function getPrimaryExtension(): string {
    return MachineLanguageMetaData.fileExtensions[0];
}

/**
 * Check if a given file extension is supported.
 *
 * @param ext - Extension to check (with or without leading dot)
 * @returns true if the extension is supported
 */
export function isValidExtension(ext: string): boolean {
    const normalized = ext.startsWith('.') ? ext : `.${ext}`;
    return MachineLanguageMetaData.fileExtensions.includes(normalized);
}
