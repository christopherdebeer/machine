import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';
import { getFileExtensions } from '../../src/language/file-extensions.js';

/**
 * API endpoint to list machine files from a directory
 *
 * Query params:
 * - dir: Directory to list files from (defaults to 'examples')
 *
 * Returns: Array of file objects with name, path, and category
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get working directory from environment or query param
  const workingDir = (req.query.dir as string) || process.env.DYGRAM_WORKING_DIR || 'examples';

  // Resolve to absolute path
  const baseDir = path.resolve(process.cwd(), workingDir);

  // Security: Ensure the resolved path is within allowed directories
  const allowedDirs = [
    path.resolve(process.cwd(), 'examples'),
    path.resolve(process.cwd()),
  ];

  const isAllowed = allowedDirs.some(allowed => baseDir.startsWith(allowed));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Access denied to directory' });
  }

  try {
    // Check if directory exists
    if (!fs.existsSync(baseDir)) {
      return res.status(404).json({ error: 'Directory not found', path: workingDir});
    }

    const files: Array<{
      name: string;
      path: string;
      category: string;
      filename: string;
    }> = [];

    // Get supported file extensions
    const extensions = getFileExtensions();

    // Recursively scan for machine files
    function scanDirectory(dir: string, relativePath: string = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and hidden directories
          if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue;
          }
          scanDirectory(fullPath, relPath);
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          // Extract category from path
          const pathParts = relPath.split(path.sep);
          const category = pathParts.length > 1 ? pathParts[0] : 'root';
          const nameWithoutExt = path.basename(entry.name, path.extname(entry.name));
          const readableName = nameWithoutExt
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          files.push({
            name: readableName,
            path: relPath.replace(/\\/g, '/'),
            category,
            filename: entry.name,
          });
        }
      }
    }

    scanDirectory(baseDir);

    // Sort files by category and name
    files.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });

    res.status(200).json({
      workingDir,
      files,
      count: files.length,
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      error: 'Failed to list files',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
