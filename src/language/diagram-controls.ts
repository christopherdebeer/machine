import mermaid from 'mermaid';

// Initialize mermaid with custom settings
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    // logLevel: 0,
    htmlLabels: true
});

// Function to toggle dark/light theme
export function toggleTheme(): void {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    location.reload(); // Refresh to update the diagram
}

// Function to download the diagram as SVG
export function downloadSVG(): void {
    const svg = document.querySelector('#diagram svg');
    if (!svg) {
        console.warn('No SVG diagram found to download');
        return;
    }
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml' });
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
    const svg = document.querySelector('#diagram svg');
    if (!svg) {
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

    const serializer = new XMLSerializer();
    const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serializer.serializeToString(svg));
    loader.src = source;
}

// Function to render the diagram
export async function render(code: string, containerOveride?: Element, id?: string): Promise<void> {
    try {
        const uniqueId = "mermaid-svg-" + (id || Date.now());
        console.log("Rendering diagram with code:", code);
        await mermaid.mermaidAPI.getDiagramFromText(code);
        const svg = document.createElement('svg');
        const render = await mermaid.render(uniqueId, code);
        const container = containerOveride || document.querySelector('#diagram');
        if (!container) {
            throw new Error('Diagram container not found');
        }
        container.innerHTML = "";
        container.appendChild(svg);
        svg.outerHTML = render.svg;
        render.bindFunctions?.(container);
    } catch (error) {
        console.error('Error rendering diagram:', error);
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
