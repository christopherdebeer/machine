import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * API endpoint to write/update a machine file
 *
 * Only works in local mode (when DYGRAM_LOCAL_MODE=true)
 *
 * Body params:
 * - file: Relative path to the file (required)
 * - content: File content (required)
 * - dir: Base directory (defaults to current working directory)
 *
 * Returns: Success message
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST/PUT requests
  if (req.method !== 'POST' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if we're in local mode
  const isLocalMode = process.env.DYGRAM_LOCAL_MODE === 'true';
  if (!isLocalMode) {
    return res.status(403).json({
      error: 'Write operations are only allowed in local mode',
      localMode: false,
    });
  }

  const { file: filePath, content, dir } = req.body;

  if (!filePath) {
    return res.status(400).json({ error: 'Missing file parameter' });
  }

  if (content === undefined || content === null) {
    return res.status(400).json({ error: 'Missing content parameter' });
  }

  // Security: Reject paths with directory traversal attempts
  if (filePath.includes('..') || filePath.includes('\\') || path.isAbsolute(filePath)) {
    return res.status(400).json({ error: 'Invalid file path' });
  }

  // Ensure file has valid extension
  if (!filePath.endsWith('.dygram') && !filePath.endsWith('.mach')) {
    return res.status(400).json({ error: 'Invalid file extension. Only .dygram and .mach files are allowed' });
  }

  // Get working directory from request or environment
  const workingDir = dir || process.env.DYGRAM_WORKING_DIR || process.cwd();

  // Resolve to absolute path
  const baseDir = path.resolve(process.cwd(), workingDir);
  const fullPath = path.resolve(baseDir, filePath);

  // Security: Ensure the resolved path is within the working directory
  if (!fullPath.startsWith(baseDir)) {
    return res.status(403).json({ error: 'Access denied to file location' });
  }

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    // Write file content
    fs.writeFileSync(fullPath, content, 'utf-8');

    res.status(200).json({
      success: true,
      path: filePath,
      filename: path.basename(fullPath),
      message: 'File saved successfully',
    });
  } catch (error) {
    console.error('Error writing file:', error);
    res.status(500).json({
      error: 'Failed to write file',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
