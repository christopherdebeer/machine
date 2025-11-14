/**
 * Test Component for Bidirectional Highlighting
 * 
 * Demonstrates multiple CodeEditor instances with independent highlighting services
 */

import React from 'react';
import { CodeEditor } from './CodeEditor';

const testCode1 = `machine TestMachine1 {
  state idle
  state running
  state stopped
  
  idle -> running : start
  running -> stopped : stop
  stopped -> idle : reset
}`;

const testCode2 = `machine TestMachine2 {
  namespace UserInterface {
    state login
    state dashboard
    state profile
    
    login -> dashboard : authenticate
    dashboard -> profile : viewProfile
    profile -> dashboard : back
  }
  
  namespace Backend {
    state processing
    state complete
    
    processing -> complete : finish
  }
}`;

export const BidirectionalHighlightingTest: React.FC = () => {
    return (
        <div style={{ padding: '20px' }}>
            <h2>Bidirectional Highlighting Test</h2>
            <p>
                This test demonstrates:
                <br />• Multiple CodeEditor instances with independent highlighting services
                <br />• Bidirectional highlighting: click diagram elements to highlight source code
                <br />• Reverse highlighting: move cursor in code to highlight diagram elements
                <br />• Each editor maintains its own highlighting state
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', marginTop: '20px' }}>
                <div>
                    <h3>Editor 1 - Simple State Machine</h3>
                    <CodeEditor
                        initialCode={testCode1}
                        mode="split"
                        height="300px"
                        showOutput={true}
                    />
                </div>
                
                <div>
                    <h3>Editor 2 - Namespaced State Machine</h3>
                    <CodeEditor
                        initialCode={testCode2}
                        mode="split"
                        height="300px"
                        showOutput={true}
                    />
                </div>
            </div>
            
            <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                <h4>How to Test:</h4>
                <ol>
                    <li><strong>Diagram → Code:</strong> Click on any state or transition in the diagrams to highlight the corresponding source code</li>
                    <li><strong>Code → Diagram:</strong> Move your cursor to different parts of the source code to see diagram elements highlight</li>
                    <li><strong>Independence:</strong> Verify that highlighting in one editor doesn't affect the other editor</li>
                    <li><strong>Multiple Elements:</strong> Try clicking on namespaces, states, and transitions to see different highlighting behaviors</li>
                </ol>
            </div>
        </div>
    );
};
