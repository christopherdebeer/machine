#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use absolute path to find the CLI module relative to this bin script
const cliPath = join(__dirname, '..', 'out', 'cli', 'main.cjs');

const mainModule = await import(cliPath);
mainModule.default.default();
