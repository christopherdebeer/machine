// D3 rendering is handled directly in the d3-diagram-renderer module
// No initialization needed

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
// Now expects an SVG string from D3 renderer instead of Mermaid code
export async function render(svgString: string, containerOveride?: Element, id?: string): Promise<void> {
    if (!svgString) {
        console.warn('No SVG content provided to render');
        return;
    }
    try {
        console.log("Rendering D3 diagram");
        const container = containerOveride || document.querySelector('#diagram');
        if (!container) {
            throw new Error('Diagram container not found');
        }
        // Insert the SVG directly into the container
        container.innerHTML = svgString;

        // Make the diagram interactive (zoom/pan already embedded in SVG)
        console.log('D3 diagram rendered successfully');
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
