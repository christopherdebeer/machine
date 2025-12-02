/**
 * Global type declarations
 */

interface Window {
    downloadSVG?: (svg: string, filename: string) => void;
    downloadPNG?: (svg: string, filename: string) => void;
}
