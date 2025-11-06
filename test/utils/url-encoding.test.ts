/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    base64UrlEncode,
    base64UrlDecode,
    parseHashParams,
    updateHashParams,
    type HashParams,
} from '../../src/utils/url-encoding.js';

describe('URL Encoding Utilities', () => {
    describe('base64UrlEncode', () => {
        it('should encode simple ASCII strings', () => {
            const input = 'Hello World';
            const encoded = base64UrlEncode(input);
            expect(encoded).toBeTruthy();
            expect(encoded).not.toContain('+');
            expect(encoded).not.toContain('/');
            expect(encoded).not.toContain('=');
        });

        it('should encode unicode characters correctly', () => {
            const input = 'Hello 世界';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should encode emojis correctly', () => {
            const input = 'Hello 🌍 🎮 👋';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should handle special characters and symbols', () => {
            const testCases = [
                'a+b/c=d',
                'test@example.com',
                'price: $100',
                'math: 2+2=4',
                'path/to/file',
                'key=value&foo=bar',
                'quotes: "hello" \'world\'',
                'newline:\ntest',
                'tab:\ttest',
            ];

            testCases.forEach((input) => {
                const encoded = base64UrlEncode(input);
                const decoded = base64UrlDecode(encoded);
                expect(decoded).toBe(input);
            });
        });

        it('should handle machine code with special characters', () => {
            const machineCode = `machine Example {
    state Start {
        message: "Hello 世界 🌍"
    }

    Start -> End [label: "transition"]
}`;
            const encoded = base64UrlEncode(machineCode);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(machineCode);
        });

        it('should produce URL-safe output', () => {
            const input = 'test+with/special=chars';
            const encoded = base64UrlEncode(input);

            // Should not contain problematic URL characters
            expect(encoded).not.toContain('+');
            expect(encoded).not.toContain('/');
            expect(encoded).not.toContain('=');

            // Should only contain URL-safe characters
            expect(encoded).toMatch(/^[A-Za-z0-9\-_~]*$/);
        });

        it('should handle empty strings', () => {
            const encoded = base64UrlEncode('');
            expect(encoded).toBe('');
        });

        it('should handle very long strings', () => {
            const input = 'a'.repeat(10000);
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should handle strings with mixed content types', () => {
            const input = 'ASCII text, 中文字符, العربية, עברית, 日本語, 한국어, Emoji: 😀🎉🚀';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should handle zero-width characters', () => {
            const input = 'test\u200B\u200C\u200Dtest'; // Zero-width space, non-joiner, joiner
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should handle control characters', () => {
            const input = 'line1\nline2\rline3\ttab';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });
    });

    describe('base64UrlDecode', () => {
        it('should decode URL-safe base64 strings', () => {
            const original = 'Hello World';
            const encoded = base64UrlEncode(original);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(original);
        });

        it('should handle invalid base64 gracefully', () => {
            const invalid = 'not-valid-base64!!!';
            const decoded = base64UrlDecode(invalid);
            expect(decoded).toBe(''); // Should return empty string instead of throwing
        });

        it('should handle empty strings', () => {
            const decoded = base64UrlDecode('');
            expect(decoded).toBe('');
        });

        it('should decode strings with URL-safe characters', () => {
            // Manually create a URL-safe base64 string
            const urlSafe = 'SGVsbG8gV29ybGQ~'; // "Hello World" with padding as ~
            const decoded = base64UrlDecode(urlSafe);
            expect(decoded).toBe('Hello World');
        });

        it('should not throw on malformed input', () => {
            expect(() => base64UrlDecode('%%%')).not.toThrow();
            expect(() => base64UrlDecode('abc')).not.toThrow();
            expect(() => base64UrlDecode('!@#$%')).not.toThrow();
        });
    });

    describe('Round-trip encoding/decoding', () => {
        it('should maintain data integrity through round-trip', () => {
            const testCases = [
                'Simple text',
                'Text with numbers 123456',
                'Special chars: !@#$%^&*()',
                'Unicode: 你好世界',
                'Emojis: 😀🎉🚀🌟',
                'Mixed: Hello 世界 🌍 test@example.com',
                'Newlines:\nand\ntabs:\ttest',
                'machine Example {\n    state Start\n}',
            ];

            testCases.forEach((original) => {
                const encoded = base64UrlEncode(original);
                const decoded = base64UrlDecode(encoded);
                expect(decoded).toBe(original);
            });
        });

        it('should be idempotent for decode(encode(x))', () => {
            const input = 'Test 测试 🎮';
            const result1 = base64UrlDecode(base64UrlEncode(input));
            const result2 = base64UrlDecode(base64UrlEncode(result1));
            expect(result1).toBe(input);
            expect(result2).toBe(input);
        });
    });

    describe('parseHashParams', () => {
        beforeEach(() => {
            // Mock window.location.hash
            delete (window as any).location;
            (window as any).location = { hash: '' };
        });

        it('should parse empty hash', () => {
            window.location.hash = '';
            const params = parseHashParams();
            expect(params).toEqual({});
        });

        it('should parse example parameter', () => {
            window.location.hash = '#example=basic';
            const params = parseHashParams();
            expect(params.example).toBe('basic');
        });

        it('should parse and decode content parameter', () => {
            const content = 'Hello World';
            const encoded = base64UrlEncode(content);
            window.location.hash = `#content=${encoded}`;
            const params = parseHashParams();
            expect(params.content).toBe(content);
        });

        it('should parse sections parameter', () => {
            window.location.hash = '#sections=000msm001';
            const params = parseHashParams();
            expect(params.sections).toBe('000msm001');
        });

        it('should parse multiple parameters', () => {
            const content = 'Test content';
            const encoded = base64UrlEncode(content);
            window.location.hash = `#example=advanced&content=${encoded}&sections=111sss000`;
            const params = parseHashParams();
            expect(params.example).toBe('advanced');
            expect(params.content).toBe(content);
            expect(params.sections).toBe('111sss000');
        });

        it('should handle URL-encoded characters in example names', () => {
            window.location.hash = '#example=hello%20world';
            const params = parseHashParams();
            expect(params.example).toBe('hello world');
        });

        it('should handle malformed hash gracefully', () => {
            window.location.hash = '#invalid&no=equals=multiple&=nokey&novalue=';
            const params = parseHashParams();
            // Should only parse valid key=value pairs
            expect(params.no).toBeUndefined(); // Has multiple = signs, might be skipped
        });

        it('should handle hash with special characters', () => {
            const content = 'Test with 世界 🌍';
            const encoded = base64UrlEncode(content);
            window.location.hash = `#content=${encoded}`;
            const params = parseHashParams();
            expect(params.content).toBe(content);
        });
    });

    describe('updateHashParams', () => {
        let replaceSpy: any;

        beforeEach(() => {
            delete (window as any).location;
            delete (window as any).history;

            (window as any).location = {
                hash: '',
                pathname: '/test',
            };

            (window as any).history = {
                replaceState: vi.fn(),
            };

            replaceSpy = vi.spyOn(window.history, 'replaceState');
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should set content parameter with encoding', () => {
            const content = 'Hello World';
            updateHashParams({ content });

            expect(replaceSpy).toHaveBeenCalledWith(
                null,
                '',
                expect.stringContaining('content=')
            );

            // Verify the content is actually encoded
            const hash = replaceSpy.mock.calls[0][2];
            expect(hash).toContain('#content=');
            expect(hash).not.toContain('Hello World'); // Should be encoded
        });

        it('should set example parameter', () => {
            updateHashParams({ example: 'basic' });

            expect(replaceSpy).toHaveBeenCalledWith(
                null,
                '',
                '#example=basic'
            );
        });

        it('should set sections parameter', () => {
            updateHashParams({ sections: '000msm001' });

            expect(replaceSpy).toHaveBeenCalledWith(
                null,
                '',
                '#sections=000msm001'
            );
        });

        it('should combine multiple parameters', () => {
            updateHashParams({
                example: 'advanced',
                content: 'Test',
                sections: '111sss000',
            });

            const hash = replaceSpy.mock.calls[0][2];
            expect(hash).toContain('example=advanced');
            expect(hash).toContain('content=');
            expect(hash).toContain('sections=111sss000');
        });

        it('should clear hash when no parameters provided', () => {
            window.location.hash = '#example=test';
            updateHashParams({});

            expect(replaceSpy).toHaveBeenCalledWith(
                null,
                '',
                '/test' // Just the pathname, no hash
            );
        });

        it('should not update if hash is already correct', () => {
            window.location.hash = '#example=test';
            updateHashParams({ example: 'test' });

            // Should NOT be called since hash is already correct
            expect(replaceSpy).not.toHaveBeenCalled();
        });

        it('should encode special characters in content', () => {
            const content = 'Hello 世界 🌍';
            updateHashParams({ content });

            const hash = replaceSpy.mock.calls[0][2];
            expect(hash).toContain('#content=');

            // Parse it back to verify encoding works
            window.location.hash = hash;
            const parsed = parseHashParams();
            expect(parsed.content).toBe(content);
        });

        it('should handle complex machine code', () => {
            const content = `machine Example {
    state Start {
        data: "Hello 世界"
    }
    Start -> End [label: "🎮"]
}`;
            updateHashParams({ content });

            const hash = replaceSpy.mock.calls[0][2];
            window.location.hash = hash;
            const parsed = parseHashParams();
            expect(parsed.content).toBe(content);
        });
    });

    describe('Cross-component consistency', () => {
        it('should work consistently between CodeEditor and CodeMirrorPlayground', () => {
            // Simulate CodeEditor encoding content
            const originalCode = `machine Test {
    state Start {
        message: "Hello 世界 🌍"
    }
}`;

            // CodeEditor encodes and creates link
            const encoded = base64UrlEncode(originalCode);
            const playgroundUrl = `#content=${encoded}`;

            // Simulate CodeMirrorPlayground parsing the URL
            window.location.hash = playgroundUrl;
            const params = parseHashParams();

            // Should decode to the exact same content
            expect(params.content).toBe(originalCode);
        });

        it('should maintain consistency with legacy format', () => {
            // Test that the new implementation is compatible with the URL-safe format
            // that was used in CodeEditor.tsx
            const testString = 'Hello World Test';

            // Simulate old encoding: btoa(unescape(encodeURIComponent(str)))
            //   .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '~')
            const legacyEncoded = btoa(unescape(encodeURIComponent(testString)))
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '~');

            // New implementation should decode it correctly
            const decoded = base64UrlDecode(legacyEncoded);
            expect(decoded).toBe(testString);

            // And encoding should produce the same format
            const newEncoded = base64UrlEncode(testString);
            expect(newEncoded).toBe(legacyEncoded);
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle strings with only special characters', () => {
            const input = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });

        it('should handle repeated encoding (should not double-encode)', () => {
            const input = 'Hello World';
            const encoded1 = base64UrlEncode(input);
            const encoded2 = base64UrlEncode(encoded1);

            // They should be different (encoding encoded string)
            expect(encoded1).not.toBe(encoded2);

            // But single decode should only decode once
            const decoded1 = base64UrlDecode(encoded2);
            expect(decoded1).toBe(encoded1); // Decodes to first encoding
            const decoded2 = base64UrlDecode(decoded1);
            expect(decoded2).toBe(input); // Decodes to original
        });

        it('should handle maximum URL length gracefully', () => {
            // Most browsers support URLs up to ~2000 characters
            // Base64 increases size by ~33%, so test with ~1500 char input
            const input = 'x'.repeat(1500);
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
            expect(encoded.length).toBeLessThan(2100); // Should fit in URL
        });

        it('should handle null bytes', () => {
            const input = 'before\x00after';
            const encoded = base64UrlEncode(input);
            const decoded = base64UrlDecode(encoded);
            expect(decoded).toBe(input);
        });
    });
});
