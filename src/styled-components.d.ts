/**
 * Type declarations for styled-components v6
 * Fixes missing property errors for HTML element constructors
 */

import 'styled-components';

declare module 'styled-components' {
    export interface DefaultTheme {}
    
    // Add HTML element constructors
    export const div: any;
    export const span: any;
    export const button: any;
    export const input: any;
    export const select: any;
    export const p: any;
    export const h3: any;
    export const h4: any;
    export const pre: any;
    export const code: any;
    export const img: any;
}
