/**
 * @deprecated The DOM-based ExecutionControls implementation has been removed.
 * This shim forwards to the React-based ExecutionControlsWrapper used elsewhere
 * in the playground code while preserving the original class API.
 */

import { ExecutionControlsWrapper } from '../components/ExecutionControlsWrapper.js';
import type { ExecutionControlsWrapperConfig } from '../components/ExecutionControlsWrapper';
import type { ExecutionState, ExecutionStatus } from '../components/ExecutionControls';

export type { ExecutionState, ExecutionStatus };

export interface ExecutionControlsConfig extends ExecutionControlsWrapperConfig {}

/**
 * @deprecated Use ExecutionControlsWrapper or the React component directly.
 */
export class ExecutionControls extends ExecutionControlsWrapper {
    constructor(config: ExecutionControlsConfig) {
        super(config);
        // eslint-disable-next-line no-console
        console.warn('ExecutionControls is deprecated. Use ExecutionControlsWrapper instead.');
    }
}
