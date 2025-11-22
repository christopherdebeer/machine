import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as fs from 'fs';
import * as path from 'path';

/**
 * API endpoint to list available recordings for an example
 *
 * Query params:
 * - example: Example name (e.g., "codegen-schema")
 * - category: Example category (e.g., "execution-features")
 *
 * Returns: Array of recording file names
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const exampleName = req.query.example as string;
  const category = req.query.category as string;

  if (!exampleName || !category) {
    return res.status(400).json({
      error: 'Missing required parameters',
      required: ['example', 'category']
    });
  }

  try {
    // Build recordings path: test/fixtures/recordings/generative-{category}/{example}/
    const recordingsDir = path.resolve(
      process.cwd(),
      'test',
      'fixtures',
      'recordings',
      `generative-${category}`,
      exampleName
    );

    // Check if directory exists
    if (!fs.existsSync(recordingsDir)) {
      return res.status(200).json({
        example: exampleName,
        category,
        recordings: [],
        count: 0,
        available: false
      });
    }

    // List JSON files
    const files = fs.readdirSync(recordingsDir)
      .filter(f => f.endsWith('.json'))
      .sort(); // Deterministic order

    res.status(200).json({
      example: exampleName,
      category,
      recordings: files,
      count: files.length,
      available: files.length > 0,
      path: `generative-${category}/${exampleName}`
    });
  } catch (error) {
    console.error('Error listing recordings:', error);
    res.status(500).json({
      error: 'Failed to list recordings',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
