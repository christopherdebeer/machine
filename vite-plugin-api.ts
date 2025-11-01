import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage } from 'http';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Parse request body from stream
 */
async function parseBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                if (body) {
                    resolve(JSON.parse(body));
                } else {
                    resolve(null);
                }
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

/**
 * Vite plugin to handle /api routes locally, mimicking Vercel serverless functions
 */
export function apiPlugin(workingDir?: string): Plugin {
    return {
        name: 'vite-plugin-api',
        configureServer(server: ViteDevServer) {
            // Set working directory in environment if provided
            if (workingDir) {
                process.env.DYGRAM_WORKING_DIR = workingDir;
            }
            // Enable local mode for file writing
            process.env.DYGRAM_LOCAL_MODE = 'true';

            server.middlewares.use(async (req, res, next) => {
                // Only handle /api routes
                if (!req.url?.startsWith('/api/')) {
                    return next();
                }

                // Extract the API path from the URL
                // e.g., /api/hello -> hello
                // e.g., /api/files/list -> files/list
                const apiPath = req.url.replace('/api/', '').split('?')[0];

                // Normalize the path to prevent directory traversal
                const normalizedPath = path.normalize(apiPath).replace(/^(\.\.[\/\\])+/, '');

                // Validate that the path doesn't escape the api directory
                if (normalizedPath.includes('..')) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid API endpoint path' }));
                    return;
                }

                const apiFilePath = path.join(process.cwd(), 'api', `${normalizedPath}.ts`);

                // Check if the API file exists
                if (!fs.existsSync(apiFilePath)) {
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'API endpoint not found' }));
                    return;
                }

                try {
                    // Use Vite's module system to load and execute the TypeScript file
                    const module = await server.ssrLoadModule(apiFilePath);
                    const handler = module.default || module.handler;

                    if (typeof handler !== 'function') {
                        throw new Error('No default export function found in API handler');
                    }

                    // Parse request body for POST/PUT requests
                    let body = null;
                    if (req.method === 'POST' || req.method === 'PUT') {
                        try {
                            body = await parseBody(req);
                        } catch (error) {
                            res.statusCode = 400;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                            return;
                        }
                    }

                    // Parse query parameters
                    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
                    const query: Record<string, string | string[]> = {};
                    url.searchParams.forEach((value, key) => {
                        if (query[key]) {
                            // Multiple values for same key
                            if (Array.isArray(query[key])) {
                                (query[key] as string[]).push(value);
                            } else {
                                query[key] = [query[key] as string, value];
                            }
                        } else {
                            query[key] = value;
                        }
                    });

                    // Create a mock Vercel request object
                    const mockReq = {
                        url: req.url,
                        method: req.method,
                        headers: req.headers,
                        query,
                        body,
                    };

                    // Create a mock Vercel response object
                    const mockRes = {
                        status: (code: number) => {
                            res.statusCode = code;
                            return mockRes;
                        },
                        json: (data: any) => {
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify(data));
                        },
                        send: (data: any) => {
                            res.end(data);
                        },
                        setHeader: (name: string, value: string) => {
                            res.setHeader(name, value);
                        },
                    };

                    // Call the handler
                    await handler(mockReq, mockRes);
                } catch (error) {
                    console.error('Error handling API request:', error);
                    res.statusCode = 500;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({
                        error: 'Internal server error',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }));
                }
            });
        },
    };
}
