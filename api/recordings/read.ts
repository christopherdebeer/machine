import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API endpoint to read a specific recording file
 *
 * Query params:
 * - example: Example name (e.g., "codegen-schema")
 * - category: Example category (e.g., "execution-features")
 * - file: Recording filename (e.g., "recording-001.json")
 *
 * Returns: Recording JSON object
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const exampleName = req.query.example as string;
  const category = req.query.category as string;
  const filename = req.query.file as string;

  if (!exampleName || !category || !filename) {
    return res.status(400).json({
      error: 'Missing required parameters',
      required: ['example', 'category', 'file']
    });
  }

  // Security: Validate all path components to prevent path traversal
  const invalidPathChars = /[.\/\\]/;
  if (invalidPathChars.test(category)) {
    return res.status(400).json({ error: 'Invalid category parameter' });
  }
  if (invalidPathChars.test(exampleName)) {
    return res.status(400).json({ error: 'Invalid example parameter' });
  }
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    // Build recording file path
    const recordingsRoot = path.resolve(
      process.cwd(),
      'test',
      'fixtures',
      'recordings'
    );

    const recordingPath = path.resolve(
      recordingsRoot,
      `generative-${category}`,
      exampleName,
      filename
    );

    // Security: Verify resolved path is still within the recordings directory
    const normalizedPath = path.normalize(recordingPath);
    if (!normalizedPath.startsWith(recordingsRoot + path.sep)) {
      return res.status(403).json({ error: 'Access denied: path outside recordings directory' });
    }

    // Check if file exists
    if (!fs.existsSync(recordingPath)) {
      return res.status(404).json({
        error: 'Recording not found',
        example: exampleName,
        category,
        file: filename
      });
    }

    // Read and parse JSON
    const content = fs.readFileSync(recordingPath, 'utf-8');
    const recording = JSON.parse(content);

    res.status(200).json(recording);
  } catch (error) {
    console.error('Error reading recording:', error);
    res.status(500).json({
      error: 'Failed to read recording',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
