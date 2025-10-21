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

    // Determine base URL from environment variables
    // Priority: SITEMAP_BASE_URL > VERCEL_PROJECT_PRODUCTION_URL > default
    let baseUrl = process.env.SITEMAP_BASE_URL;

    if (!baseUrl && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        // Vercel provides hostname without protocol
        baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
        console.log(`   Using Vercel production URL: ${baseUrl}`);
    }

    if (!baseUrl) {
        // Default fallback
        baseUrl = 'https://christopherdebeer.github.io/machine/';
        console.log(`   Using default URL: ${baseUrl}`);
    }

    // Ensure baseUrl has protocol
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        // If no protocol, assume https
        baseUrl = `https://${baseUrl}`;
    }

    // Ensure trailing slash
    if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
    }

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
