/**
 * Test Metadata System for Generative Tests
 * 
 * Provides structured metadata parsing and validation for test cases
 * extracted from markdown documentation.
 */

export interface TestMetadata {
    name: string;
    category: string;
    description: string;
    expectedBehaviors: string[];
    executionLimits: {
        maxSteps: number;
        timeout: number;
    };
    assertions: TestAssertion[];
    tags: string[];
}

export interface TestAssertion {
    type: 'nodeVisited' | 'finalNode' | 'historyLength' | 'visitedCount' | 'contextValue' | 'custom';
    description: string;
    condition: string;
    expected: any;
}

export interface ParsedTestCase {
    metadata: TestMetadata;
    machineContent: string;
    sourceFile: string;
    sourceLine: number;
}

/**
 * Parse test metadata from markdown content
 */
export function parseTestMetadata(
    markdownContent: string, 
    testName: string, 
    category: string
): TestMetadata {
    const lines = markdownContent.split('\n');
    const metadata: TestMetadata = {
        name: testName,
        category,
        description: '',
        expectedBehaviors: [],
        executionLimits: {
            maxSteps: 20,
            timeout: 10000
        },
        assertions: [],
        tags: []
    };

    let inTestSection = false;
    let inExpectedBehaviors = false;
    let currentSection = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Find the test section
        if (trimmed.includes(`${testName}.dy`) || 
            trimmed.includes(testName.replace(/-/g, ' '))) {
            inTestSection = true;
            
            // Look backwards for the section title
            for (let j = i - 1; j >= 0; j--) {
                const prevLine = lines[j].trim();
                if (prevLine.startsWith('###')) {
                    metadata.description = prevLine.replace('###', '').trim();
                    break;
                }
            }
            continue;
        }

        if (!inTestSection) continue;

        // End of test section
        if ((trimmed.startsWith('##') || trimmed.startsWith('###')) && 
            !trimmed.includes(testName)) {
            break;
        }

        // Parse expected behaviors
        if (trimmed === '**Expected Behavior:**') {
            inExpectedBehaviors = true;
            continue;
        }

        if (inExpectedBehaviors && trimmed.startsWith('- Should ')) {
            const behavior = trimmed.substring(2); // Remove "- "
            metadata.expectedBehaviors.push(behavior);
            
            // Convert behaviors to assertions
            const assertion = behaviorToAssertion(behavior);
            if (assertion) {
                metadata.assertions.push(assertion);
            }
        }

        // Parse execution limits from machine content
        if (trimmed.includes('maxSteps:')) {
            const match = trimmed.match(/maxSteps:\s*(\d+)/);
            if (match) {
                metadata.executionLimits.maxSteps = parseInt(match[1]);
            }
        }

        // Parse tags from comments or annotations
        if (trimmed.startsWith('// @tags:') || trimmed.startsWith('# @tags:')) {
            const tagsStr = trimmed.split('@tags:')[1].trim();
            metadata.tags = tagsStr.split(',').map(t => t.trim());
        }

        // End expected behaviors section
        if (inExpectedBehaviors && trimmed && !trimmed.startsWith('- ') && 
            !trimmed.startsWith('**')) {
            inExpectedBehaviors = false;
        }
    }

    return metadata;
}

/**
 * Convert expected behavior text to structured assertion
 */
function behaviorToAssertion(behavior: string): TestAssertion | null {
    const lowerBehavior = behavior.toLowerCase();

    if (lowerBehavior.includes('should transition from start node')) {
        return {
            type: 'finalNode',
            description: behavior,
            condition: 'currentNode !== "start"',
            expected: true
        };
    }

    if (lowerBehavior.includes('should reach end state')) {
        return {
            type: 'finalNode',
            description: behavior,
            condition: 'currentNode === "end"',
            expected: true
        };
    }

    if (lowerBehavior.includes('should have at least') && lowerBehavior.includes('nodes')) {
        const match = behavior.match(/(\d+)\s+nodes/);
        const count = match ? parseInt(match[1]) : 2;
        return {
            type: 'visitedCount',
            description: behavior,
            condition: `visitedNodes.size >= ${count}`,
            expected: count
        };
    }

    if (lowerBehavior.includes('should have') && lowerBehavior.includes('steps')) {
        const match = behavior.match(/(\d+)\s+steps/);
        const count = match ? parseInt(match[1]) : 1;
        return {
            type: 'historyLength',
            description: behavior,
            condition: `history.length >= ${count}`,
            expected: count
        };
    }

    if (lowerBehavior.includes('should not throw errors')) {
        return {
            type: 'custom',
            description: behavior,
            condition: 'noErrors',
            expected: true
        };
    }

    if (lowerBehavior.includes('should handle') && lowerBehavior.includes('decision points')) {
        return {
            type: 'historyLength',
            description: behavior,
            condition: 'history.length >= 2',
            expected: 2
        };
    }

    if (lowerBehavior.includes('should complete execution')) {
        return {
            type: 'custom',
            description: behavior,
            condition: 'executionCompleted',
            expected: true
        };
    }

    // Default assertion for unrecognized behaviors
    return {
        type: 'custom',
        description: behavior,
        condition: 'true', // Always pass for unrecognized behaviors
        expected: true
    };
}

/**
 * Validate test execution against metadata assertions
 */
export function validateTestExecution(
    metadata: TestMetadata,
    executionContext: any,
    executionCompleted: boolean,
    hadErrors: boolean
): { passed: boolean; failures: string[] } {
    const failures: string[] = [];

    for (const assertion of metadata.assertions) {
        try {
            const result = evaluateAssertion(assertion, executionContext, executionCompleted, hadErrors);
            if (!result) {
                failures.push(`Failed: ${assertion.description}`);
            }
        } catch (error) {
            failures.push(`Error evaluating assertion "${assertion.description}": ${error}`);
        }
    }

    return {
        passed: failures.length === 0,
        failures
    };
}

/**
 * Evaluate a single assertion against execution context
 */
function evaluateAssertion(
    assertion: TestAssertion,
    context: any,
    executionCompleted: boolean,
    hadErrors: boolean
): boolean {
    switch (assertion.type) {
        case 'finalNode':
            if (assertion.condition.includes('!==')) {
                const expectedNode = assertion.condition.split('!==')[1].trim().replace(/"/g, '');
                return context.currentNode !== expectedNode;
            }
            if (assertion.condition.includes('===')) {
                const expectedNode = assertion.condition.split('===')[1].trim().replace(/"/g, '');
                return context.currentNode === expectedNode;
            }
            return false;

        case 'visitedCount':
            const visitedCountMatch = assertion.condition.match(/>=\s*(\d+)/);
            if (visitedCountMatch) {
                const expectedCount = parseInt(visitedCountMatch[1]);
                return context.visitedNodes.size >= expectedCount;
            }
            return false;

        case 'historyLength':
            const historyLengthMatch = assertion.condition.match(/>=\s*(\d+)/);
            if (historyLengthMatch) {
                const expectedLength = parseInt(historyLengthMatch[1]);
                return context.history.length >= expectedLength;
            }
            return false;

        case 'nodeVisited':
            const nodeName = assertion.expected;
            return context.visitedNodes.has(nodeName);

        case 'contextValue':
            // For context value assertions, we'd need to implement context access
            // This would require the actual context structure
            return true; // Placeholder

        case 'custom':
            if (assertion.condition === 'noErrors') {
                return !hadErrors;
            }
            if (assertion.condition === 'executionCompleted') {
                return executionCompleted;
            }
            if (assertion.condition === 'true') {
                return true; // Always pass
            }
            return false;

        default:
            return false;
    }
}

/**
 * Generate test report from metadata and execution results
 */
export function generateTestReport(
    metadata: TestMetadata,
    executionContext: any,
    executionTime: number,
    validationResult: { passed: boolean; failures: string[] }
): string {
    const report = [
        `Test: ${metadata.name}`,
        `Category: ${metadata.category}`,
        `Description: ${metadata.description}`,
        `Execution Time: ${executionTime}ms`,
        ``,
        `Results:`,
        `- Nodes Visited: ${executionContext.visitedNodes.size}`,
        `- Steps Executed: ${executionContext.history.length}`,
        `- Final Node: ${executionContext.currentNode}`,
        ``,
        `Validation: ${validationResult.passed ? 'PASSED' : 'FAILED'}`,
    ];

    if (validationResult.failures.length > 0) {
        report.push('', 'Failures:');
        validationResult.failures.forEach(failure => {
            report.push(`- ${failure}`);
        });
    }

    if (metadata.tags.length > 0) {
        report.push('', `Tags: ${metadata.tags.join(', ')}`);
    }

    return report.join('\n');
}

/**
 * Extract test cases from markdown files with metadata
 */
export async function extractTestCasesWithMetadata(
    markdownFiles: string[]
): Promise<ParsedTestCase[]> {
    const testCases: ParsedTestCase[] = [];

    for (const filePath of markdownFiles) {
        // This would integrate with the existing example extraction system
        // For now, this is a placeholder that shows the intended structure
    }

    return testCases;
}
