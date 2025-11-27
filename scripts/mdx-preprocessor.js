/**
 * MDX Preprocessing Functions
 * 
 * This module provides functions to preprocess markdown content before
 * MDX compilation to avoid syntax conflicts. The main issues are:
 * 
 * 1. MDX interprets patterns like "1. Text" as potential JSX component names
 * 2. MDX interprets "<2%" as opening JSX tag "<2", but component names can't start with numbers
 */

/**
 * Escape problematic patterns in markdown content for MDX compilation
 * 
 * @param {string} content - Raw markdown content
 * @returns {string} - Preprocessed content safe for MDX compilation
 */
export function preprocessMarkdownForMdx(content) {
    let processed = content;
    
    // Pattern 1: Numbers followed by less-than signs (e.g., "<2%", "<10", etc.)
    // These get interpreted as JSX component opening tags but component names can't start with numbers
    processed = processed.replace(/<(\d)/g, '\\<$1');
    
    // Pattern 2: Numbers at the start of strong/emphasis in headings (e.g., "#### 1. ✅ Title")
    // While these work in simple cases, they can cause issues in complex documents
    processed = processed.replace(/^(#{1,6}\s+)(\d+)(\.\s+)/gm, '$1$2\\$3');
    
    // Pattern 3: Numbers at the start of strong text that might be interpreted as JSX (e.g., "**1. ✅ Text**")
    // This is more conservative - only escape if it looks like it might cause issues
    processed = processed.replace(/(\*\*|\*)(\d+)(\.\s+)/g, '$1$2\\$3');
    
    // Pattern 4: Any other cases where < is followed immediately by a digit
    // This is a catch-all for mathematical expressions, comparisons, etc.
    processed = processed.replace(/(\s|^)<(\d)/g, '$1\\<$2');
    
    return processed;
}

/**
 * Test the preprocessing function with known problematic patterns
 * 
 * @returns {Object[]} Array of test results
 */
export function testPreprocessing() {
    const testCases = [
        {
            name: 'Less-than with number',
            input: '- **Redundancy:** <2%',
            expected: '- **Redundancy:** \\<2%'
        },
        {
            name: 'Numbered heading',
            input: '#### 1. ✅ Removed Dead Code (474 lines total)',
            expected: '#### 1\\. ✅ Removed Dead Code (474 lines total)'
        },
        {
            name: 'Numbered bold text',
            input: '**1. ✅ Meta-Programming Guide**',
            expected: '**1\\. ✅ Meta-Programming Guide**'
        },
        {
            name: 'Mathematical expression',
            input: 'Performance improved by <50% in most cases',
            expected: 'Performance improved by \\<50% in most cases'
        },
        {
            name: 'Multiple patterns',
            input: '#### 2. Performance: <10ms response time\n**3. ✅ Complete**',
            expected: '#### 2\\. Performance: \\<10ms response time\n**3\\. ✅ Complete**'
        },
        {
            name: 'Normal markdown (should not change)',
            input: '## Normal Heading\nThis is **bold** text with _italics_.',
            expected: '## Normal Heading\nThis is **bold** text with _italics_.'
        },
        {
            name: 'Valid JSX-like syntax (should not change)',
            input: 'Use <Component prop="value" /> in your code.',
            expected: 'Use <Component prop="value" /> in your code.'
        }
    ];
    
    const results = [];
    for (const testCase of testCases) {
        const actual = preprocessMarkdownForMdx(testCase.input);
        const passed = actual === testCase.expected;
        
        results.push({
            ...testCase,
            actual,
            passed
        });
    }
    
    return results;
}

/**
 * Apply preprocessing to a file and return the processed content
 * 
 * @param {string} filePath - Path to the markdown file
 * @returns {Promise<string>} - Preprocessed content
 */
export async function preprocessFile(filePath) {
    const { readFile } = await import('fs/promises');
    const content = await readFile(filePath, 'utf-8');
    return preprocessMarkdownForMdx(content);
}
