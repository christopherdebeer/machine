import type { Plugin, ViteDevServer } from 'vite';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Vite plugin to handle /api routes locally, mimicking Vercel serverless functions
 */
export function apiPlugin(): Plugin {
    return {
        name: 'vite-plugin-api',
        configureServer(server: ViteDevServer) {
            server.middlewares.use(async (req, res, next) => {
                // Only handle /api routes
                if (!req.url?.startsWith('/api/')) {
                    return next();
                }

                // Extract the function name from the URL
                // e.g., /api/hello -> hello
                const functionName = req.url.replace('/api/', '').split('?')[0];

                // Normalize and validate the path to prevent directory traversal
                const normalizedName = path.normalize(functionName).replace(/^(\.\.[\/\\])+/, '');

                // Ensure the path doesn't contain any directory separators (only allow single-level files)
                if (normalizedName.includes('/') || normalizedName.includes('\\') || normalizedName.includes('..')) {
                    res.statusCode = 400;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: 'Invalid API endpoint path' }));
                    return;
                }

                const apiFilePath = path.join(process.cwd(), 'api', `${normalizedName}.ts`);

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

                    // Create a mock Vercel request object
                    const mockReq = {
                        url: req.url,
                        method: req.method,
                        headers: req.headers,
                        query: new URL(req.url || '', `http://${req.headers.host}`).searchParams,
                        body: null, // Could be enhanced to parse body
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
