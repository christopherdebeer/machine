/**
 * URL Hash Parameter Encoding Utilities
 *
 * Provides consistent URL-safe base64 encoding/decoding for hash parameters.
 * This ensures special characters (unicode, emojis, etc.) are handled correctly
 * when sharing playground content via URLs.
 */

/**
 * Encodes a string to URL-safe base64 format.
 *
 * This function:
 * 1. Converts the string to UTF-8 bytes via encodeURIComponent
 * 2. Encodes to base64 using btoa
 * 3. Makes it URL-safe by replacing characters:
 *    - '+' -> '-' (plus to minus)
 *    - '/' -> '_' (slash to underscore)
 *    - '=' -> '~' (equals to tilde)
 *
 * @param str - The string to encode
 * @returns URL-safe base64 encoded string
 *
 * @example
 * ```ts
 * const encoded = base64UrlEncode("Hello 世界 🌍");
 * // Returns: "SGVsbG8g5LiW55WM77yB8J-MjQ~~"
 * ```
 */
export function base64UrlEncode(str: string): string {
    try {
        // Handle UTF-8 encoding properly using escape sequence
        // encodeURIComponent converts to UTF-8 percent encoding
        // unescape converts percent encoding to raw bytes for btoa
        const base64 = btoa(unescape(encodeURIComponent(str)));

        // Make URL-safe by replacing problematic characters
        return base64
            .replace(/\+/g, '-')  // Plus to minus
            .replace(/\//g, '_')  // Slash to underscore
            .replace(/=/g, '~');  // Equals to tilde (padding)
    } catch (error) {
        console.error('Failed to encode string to base64:', error);
        throw new Error(`Base64 encoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Decodes a URL-safe base64 string back to its original format.
 *
 * This function:
 * 1. Reverses the URL-safe replacements:
 *    - '-' -> '+' (minus to plus)
 *    - '_' -> '/' (underscore to slash)
 *    - '~' -> '=' (tilde to equals)
 * 2. Decodes from base64 using atob
 * 3. Converts UTF-8 bytes back to string via decodeURIComponent
 *
 * @param str - The URL-safe base64 string to decode
 * @returns Decoded original string
 *
 * @example
 * ```ts
 * const decoded = base64UrlDecode("SGVsbG8g5LiW55WM77yB8J-MjQ~~");
 * // Returns: "Hello 世界 🌍"
 * ```
 */
export function base64UrlDecode(str: string): string {
    try {
        // Reverse URL-safe replacements
        const base64 = str
            .replace(/-/g, '+')  // Minus to plus
            .replace(/_/g, '/')  // Underscore to slash
            .replace(/~/g, '='); // Tilde to equals (padding)

        // Decode base64 and handle UTF-8 encoding properly
        // atob decodes base64 to raw bytes
        // escape converts raw bytes to percent encoding
        // decodeURIComponent converts percent encoding to UTF-8 string
        return decodeURIComponent(escape(atob(base64)));
    } catch (error) {
        console.error('Failed to decode base64 content:', error);
        // Return empty string for invalid input rather than throwing
        // This is more forgiving for malformed URLs
        return '';
    }
}

/**
 * Interface for hash parameters used in playground URLs
 */
export interface HashParams {
    /** Example key/name to load */
    example?: string;
    /** Base64-encoded content */
    content?: string;
    /** Encoded section states (collapsed/expanded, sizes) */
    sections?: string;
}

/**
 * Parses hash parameters from the current URL.
 *
 * Supports parameters in the format: #key1=value1&key2=value2
 *
 * Special handling:
 * - `content` parameter is automatically base64-decoded
 * - Other parameters are URI-decoded
 *
 * @returns Object containing parsed hash parameters
 *
 * @example
 * ```ts
 * // URL: https://example.com#content=SGVsbG8~&example=basic
 * const params = parseHashParams();
 * // Returns: { content: "Hello", example: "basic" }
 * ```
 */
export function parseHashParams(): HashParams {
    const hash = window.location.hash.slice(1); // Remove '#'
    const params: HashParams = {};

    if (!hash) return params;

    const pairs = hash.split('&');
    for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (!key || !value) continue;

        if (key === 'example') {
            params.example = decodeURIComponent(value);
        } else if (key === 'content') {
            params.content = base64UrlDecode(value);
        } else if (key === 'sections') {
            params.sections = decodeURIComponent(value);
        }
    }

    return params;
}

/**
 * Updates the URL hash with the provided parameters.
 *
 * This function:
 * - Automatically base64-encodes the `content` parameter
 * - URI-encodes other parameters
 * - Updates the URL without triggering a page reload
 * - Removes the hash if no parameters are provided
 *
 * @param params - Hash parameters to set in the URL
 *
 * @example
 * ```ts
 * updateHashParams({
 *   content: "machine Example { }",
 *   example: "basic"
 * });
 * // URL becomes: #content=bWFjaGluZS...&example=basic
 * ```
 */
export function updateHashParams(params: HashParams): void {
    const parts: string[] = [];

    if (params.example) {
        parts.push(`example=${encodeURIComponent(params.example)}`);
    }
    if (params.content) {
        parts.push(`content=${base64UrlEncode(params.content)}`);
    }
    if (params.sections) {
        parts.push(`sections=${encodeURIComponent(params.sections)}`);
    }

    const newHash = parts.length > 0 ? `#${parts.join('&')}` : '';

    // Update hash without triggering page reload
    if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash || window.location.pathname);
    }
}
