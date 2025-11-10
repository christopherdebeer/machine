import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API endpoint to read a machine file
 *
 * Query params:
 * - file: Relative path to the file (required)
 * - dir: Base directory (defaults to 'examples')
 *
 * Returns: File content
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const filePath = req.query.file as string;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing file parameter' });
  }

  // Security: Reject paths with directory traversal attempts
  if (filePath.includes('..') || filePath.includes('\\') || path.isAbsolute(filePath)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Get working directory from environment or query param
  const workingDir = (req.query.dir as string) || process.env.DYGRAM_WORKING_DIR || 'examples';

  // Resolve to absolute path
  const baseDir = path.resolve(process.cwd(), workingDir);
  const fullPath = path.resolve(baseDir, filePath);

  // Security: Ensure the resolved path is within allowed directories
  const allowedDirs = [
    path.resolve(process.cwd(), 'examples'),
    path.resolve(process.cwd()),
  ];

  const isAllowed = allowedDirs.some(allowed => fullPath.startsWith(allowed));
  if (!isAllowed) {
    return res.status(403).json({ error: 'Access denied to file' });
  }

  try {
    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found', path: filePath });
    }

    // Check if it's a file (not a directory)
    const stats = fs.statSync(fullPath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Read file content
    const content = fs.readFileSync(fullPath, 'utf-8');

    res.status(200).json({
      content,
      path: filePath,
      filename: path.basename(fullPath),
    });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({
      error: 'Failed to read file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
