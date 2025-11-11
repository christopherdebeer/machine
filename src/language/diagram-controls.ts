import { Graphviz } from '@hpcc-js/wasm';

// Cached Graphviz instance for performance
let graphvizInstance: Awaited<ReturnType<typeof Graphviz.load>> | null = null;

/**
 * Get or create the Graphviz WASM instance
 */
async function getGraphviz(): Promise<Awaited<ReturnType<typeof Graphviz.load>>> {
    if (!graphvizInstance) {
        console.log('[Playground] Initializing Graphviz WASM...');
        graphvizInstance = await Graphviz.load();
        console.log('[Playground] Graphviz WASM initialized successfully');
    }
    return graphvizInstance;
}

// Function to toggle dark/light theme
export function toggleTheme(): void {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    location.reload(); // Refresh to update the diagram
}

// Function to download the diagram as SVG
export function downloadSVG(): void {
    const img = document.querySelector('#diagram img') as HTMLImageElement;
    if (!img || !img.src.startsWith('data:image/svg+xml')) {
        console.warn('No SVG diagram found to download');
        return;
    }
    // Decode the data URI to get the SVG content
    const dataUri = img.src;
    const svgContent = decodeURIComponent(dataUri.split(',')[1]);
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'machine_diagram.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Function to download the diagram as PNG
export function downloadPNG(): void {
    const img = document.querySelector('#diagram img') as HTMLImageElement;
    if (!img || !img.src.startsWith('data:image/svg+xml')) {
        console.warn('No SVG diagram found to download');
        return;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Could not get 2D context for canvas');
        return;
    }
    const loader = new Image();

    loader.onload = function() {
        canvas.width = loader.width;
        canvas.height = loader.height;
        ctx.drawImage(loader, 0, 0);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = 'machine_diagram.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // Use the existing data URI from the img element
    loader.src = img.src;
}

// Function to render the diagram using Graphviz
export async function render(code: string, containerOveride?: Element, id?: string): Promise<void> {
    if (!code) {
        console.warn('[Playground] No code provided to render');
        return;
    }
    console.groupCollapsed('[Playground] Rendering Diagram...]')
    try {
        
        console.log('[Playground] Rendering Graphviz diagram...');
        console.log('[Playground] DOT code length:', code.length);
        console.log('[Playground] DOT code:', code);

        const gv = await getGraphviz();
        const svg = gv.dot(code);

        console.log('[Playground] SVG generated, length:', svg.length);

        const container = containerOveride || document.querySelector('#diagram');
        if (!container) {
            throw new Error('Diagram container not found');
        }

        container.innerHTML = svg;

        console.log('[Playground] ✓ Diagram rendered successfully as SVG');
        console.groupEnd();
    } catch (error) {
        console.groupEnd();
        console.error('[Playground] Error rendering diagram:', error);
        const container = containerOveride || document.querySelector('#diagram');
        if (container) {
            container.innerHTML = `
                <div style="padding: 20px; background: #ffebee; border: 2px solid #f44336; border-radius: 4px; color: #c62828;">
                    <h3 style="margin-top: 0;">⚠️ Diagram Rendering Error</h3>
                    <p><strong>Error:</strong> ${error instanceof Error ? error.message : String(error)}</p>
                    <p><strong>Check the browser console for detailed logs.</strong></p>
                </div>
            `;
        }
    }
}

// Initialize theme on load
export function initTheme(): void {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
    }
}

// Make render function available globally
declare global {
    interface Window {
        render: typeof render;
    }
}
window.render = render;
