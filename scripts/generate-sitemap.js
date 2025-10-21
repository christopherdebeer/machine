#!/usr/bin/env node

/**
 * Generate sitemap after build
 * Scans dist directory for HTML files and generates sitemap.xml
 */

import { readdir, writeFile } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function findHtmlFiles(dir, baseDir = dir) {
    const files = [];
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip assets directory
            if (entry.name === 'assets') continue;
            files.push(...await findHtmlFiles(fullPath, baseDir));
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
            const relativePath = relative(baseDir, fullPath);
            files.push(relativePath);
        }
    }

    return files;
}

async function main() {
    const projectRoot = join(__dirname, '..');
    const distDir = join(projectRoot, 'dist');
    const outputFile = join(distDir, 'sitemap.xml');
    const baseUrl = process.env.VITE_BASE_URL || 'https://christopherdebeer.github.io/machine/';

    console.log('📍 Generating sitemap...');
    console.log(`   Dist directory: ${distDir}`);
    console.log(`   Base URL: ${baseUrl}`);

    // Find all HTML files
    const htmlFiles = await findHtmlFiles(distDir);
    console.log(`   Found ${htmlFiles.length} HTML files`);

    // Create sitemap
    const links = htmlFiles.map(file => ({
        url: file.replace(/\\/g, '/'),
        changefreq: 'weekly',
        priority: file === 'index.html' ? 1.0 : 0.8
    }));

    const stream = new SitemapStream({ hostname: baseUrl });
    const data = await streamToPromise(Readable.from(links).pipe(stream));
    await writeFile(outputFile, data.toString(), 'utf-8');

    console.log(`✅ Generated sitemap: ${relative(projectRoot, outputFile)}`);
    console.log(`   ${htmlFiles.length} URLs included`);
}

main().catch(error => {
    console.error('❌ Error generating sitemap:', error);
    process.exit(1);
});
