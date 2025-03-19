/**
 * Web-compatible version of the machine executor
 * Exports the executor as a module that can be used in browser environments
 */

import { MachineExecutor, type MachineData, type MachineExecutionContext } from './machine-executor.js';

declare global {
    interface Window {
        executeMachine: (machineData: MachineData) => Promise<MachineExecutionContext>;
    }
}

// Export the executor for use in web environments
window.executeMachine = async (machineData: MachineData): Promise<MachineExecutionContext> => {
    const executor = new MachineExecutor(machineData);
    return await executor.execute();
};

// Export types and executor class for module usage
export { MachineExecutor, type MachineData, type MachineExecutionContext };
