# Import System - Remaining Work

**Status**: Phases 1-4 complete, Phases 5-6 mostly complete, Phase 7 partial, Phase 8 deferred

**Last Updated**: 2025-11-01

---

## Executive Summary

The DyGram import system is **production-ready for CLI usage** with full multi-file support in `generate`, `execute`, `check-imports`, and `bundle` commands. The playground has **foundational VFS support** with file tree UI and multi-file tabs in CodeMirror.

**Key Achievements**:
- ✅ All 4 foundational phases complete (grammar, resolution, validation, generation)
- ✅ CLI integration complete except watch mode
- ✅ Playground VFS and file tree operational
- ✅ 69 import tests passing (all import examples validated)
- ✅ Zero compilation errors after Codex fixes

**Remaining Work** falls into three categories:
1. **Quick Wins** (6-9 hours) - High-value improvements ready for immediate implementation
2. **Larger Efforts** (2-6 weeks) - Strategic enhancements requiring planning
3. **Future Features** (Phase 8) - Intentionally deferred for v1.0+

---

## Quick Wins (Recommended for Immediate Implementation)

### Watch Mode for Multi-File Development (Priority 1)

**Current State**: CLI commands work but require manual re-execution
**Gap**: No file watching or incremental recompilation for multi-file projects

**Implementation** (2-3 hours):

```typescript
// src/cli/watch-mode.ts
import chokidar from 'chokidar';
import { WorkspaceManager } from '../language/import-system/workspace-manager.js';

export class WatchMode {
  private workspace: WorkspaceManager;
  private watcher?: chokidar.FSWatcher;

  constructor(workspace: WorkspaceManager) {
    this.workspace = workspace;
  }

  async watch(entryFile: string): Promise<void> {
    const entryUri = pathToFileURL(entryFile).toString();

    // Initial load
    await this.workspace.linkAll(entryUri);

    // Watch all files in dependency graph
    const allFiles = Array.from(this.workspace.documents.keys())
      .map(uri => fileURLToPath(uri));

    this.watcher = chokidar.watch(allFiles, {
      ignoreInitial: true,
      persistent: true
    });

    this.watcher.on('change', async (changedFile) => {
      console.log(chalk.blue(`\n🔄 ${path.relative(process.cwd(), changedFile)} changed`));

      try {
        // Clear affected documents
        const changedUri = pathToFileURL(changedFile).toString();
        const dependents = this.workspace.dependencyGraph.getDependents(URI.parse(changedUri));

        // Remove changed file and dependents
        this.workspace.removeDocument(URI.parse(changedUri));
        dependents.forEach(uri => this.workspace.documents.delete(uri.toString()));

        // Reload from entry point
        await this.workspace.linkAll(entryUri);

        console.log(chalk.green('✓ Recompilation successful'));
      } catch (error) {
        console.error(chalk.red('✗ Compilation failed:'), error.message);
      }
    });
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
    }
  }
}
```

**CLI Integration**:
```typescript
// Add to src/cli/main.ts
program
  .command('watch')
  .aliases(['w'])
  .argument('<file>', 'entry file to watch')
  .option('-f, --format <formats>', 'output formats', 'json,html')
  .option('-d, --destination <dir>', 'output directory')
  .description('watch mode with auto-recompilation')
  .action(async (file, options) => {
    const services = createMachineServices(NodeFileSystem).Machine;
    const resolver = new FileSystemResolver();
    const workspace = new WorkspaceManager(services.shared.workspace.LangiumDocuments, resolver);

    const watchMode = new WatchMode(workspace);
    await watchMode.watch(file);

    console.log(chalk.blue('👀 Watching for changes... (Press Ctrl+C to exit)'));

    process.on('SIGINT', () => {
      watchMode.stop();
      process.exit(0);
    });
  });
```

**Value**: Essential for DX in multi-file projects
**Effort**: 2-3 hours
**Dependencies**: `chokidar` (npm install needed)

---

### Import Navigation in Playground (Priority 2)

**Current State**: Import statements are syntax-highlighted but not clickable
**Gap**: No UX for jumping between imported files

**Implementation** (1-2 hours):

```typescript
// src/components/ImportNavigator.tsx
export function useImportNavigation(
  vfs: VirtualFileSystem,
  onFileOpen: (path: string) => void
) {
  const handleImportClick = async (importPath: string, currentFile: string) => {
    const resolver = new VirtualFSResolver(vfs);
    const currentUri = URI.file(currentFile);

    try {
      const resolved = await resolver.resolve(importPath, currentUri);
      if (resolved) {
        // Extract file path from URI
        const filePath = resolved.uri.fsPath || resolved.uri.path;
        onFileOpen(filePath);
      } else {
        console.error(`Failed to resolve: ${importPath}`);
      }
    } catch (error) {
      console.error('Import resolution error:', error);
    }
  };

  return { handleImportClick };
}
```

**CodeMirror Integration**:
```typescript
// Add to CodeMirrorPlayground.tsx
import { syntaxTree } from '@codemirror/language';

const importNavigationExtension = ViewPlugin.fromClass(class {
  constructor(view: EditorView) {
    view.dom.addEventListener('click', this.handleClick.bind(this));
  }

  handleClick(e: MouseEvent) {
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (!pos) return;

    const tree = syntaxTree(view.state);
    const node = tree.resolveInner(pos, 1);

    // Check if click is on import path string
    if (node.name === 'String' &&
        node.parent?.name === 'ImportStatement') {
      const importPath = view.state.doc.sliceString(node.from + 1, node.to - 1);
      handleImportClick(importPath, currentFilePath);
      e.preventDefault();
    }
  }
});
```

**Value**: Essential UX for multi-file editing
**Effort**: 1-2 hours
**Dependencies**: None (uses existing VFS infrastructure)

---

### URL Import Caching and Security (Priority 3)

**Current State**: Basic URLResolver with no caching or security
**Gap**: Not production-ready for remote imports

**Implementation** (2-3 hours):

```typescript
// Enhanced src/language/import-system/module-resolver.ts
export class URLResolver implements ModuleResolver {
    private cache: Map<string, { content: string; expires: number }> = new Map();
    private readonly allowedDomains = new Set([
        'raw.githubusercontent.com',
        'cdn.jsdelivr.net',
        'unpkg.com'
    ]);
    private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
    private readonly timeout = 10000; // 10 seconds

    canResolve(importPath: string, fromUri: URI): boolean {
        if (!importPath.startsWith('http://') && !importPath.startsWith('https://')) {
            return false;
        }

        // Security: only allow HTTPS
        if (importPath.startsWith('http://')) {
            console.warn(`HTTP imports are not secure: ${importPath}`);
            return false;
        }

        // Check domain whitelist
        try {
            const url = new URL(importPath);
            return this.allowedDomains.has(url.hostname);
        } catch {
            return false;
        }
    }

    async resolve(importPath: string, fromUri: URI): Promise<ResolvedModule | undefined> {
        // Check cache first
        const cached = this.cache.get(importPath);
        if (cached && Date.now() < cached.expires) {
            return {
                uri: URI.parse(importPath),
                importPath,
                resolvedPath: importPath,
                content: cached.content
            };
        }

        try {
            // Fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(importPath, {
                signal: controller.signal,
                headers: { 'Accept': 'text/plain, application/octet-stream' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const content = await response.text();

            // Cache the result
            this.cache.set(importPath, {
                content,
                expires: Date.now() + this.cacheTTL
            });

            return {
                uri: URI.parse(importPath),
                importPath,
                resolvedPath: importPath,
                content
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout: ${importPath}`);
            }
            throw new Error(`Failed to fetch ${importPath}: ${error.message}`);
        }
    }

    // Admin method to add trusted domains
    addTrustedDomain(domain: string): void {
        this.allowedDomains.add(domain);
    }
}
```

**Configuration**:
```typescript
// Allow users to configure trusted domains
// .dygramrc.json
{
  "imports": {
    "trustedDomains": [
      "my-cdn.example.com"
    ],
    "cacheTTL": 300000,
    "timeout": 10000
  }
}
```

**Value**: Enables production URL imports securely
**Effort**: 2-3 hours
**Dependencies**: None (uses built-in fetch)

---

### Monaco Playground Decision

**Current State**: Monaco playground exists but lacks all import features
**Gap**: CodeMirror is ahead by ~1,100 lines and 4x feature-complete

**Options**:

**A. Deprecate Monaco**  **(Recommended)**
```markdown
# In Monaco Playground
⚠️ **Notice**: The Monaco playground is deprecated. For import system support and latest features,
please use the [CodeMirror Playground](/playground-mobile.html).

The Monaco playground will be maintained for backward compatibility but will not receive new features.
```

**B. Add Migration Banner**
```tsx
// playground.html
<div className="banner warning">
  🔄 <strong>Import Support Available!</strong>
  The CodeMirror playground now supports multi-file editing with imports.
  <a href="/playground-mobile.html">Try it now →</a>
</div>
```

**C. Full Implementation** (Not recommended)
- Effort: 6-8 hours initial + ongoing duplication
- Files to create: VirtualFileTree, tab bar, import examples selector
- Maintenance burden: Every feature needs dual implementation

**Recommendation**: **Option A (Deprecate)** - Focus resources on one excellent playground
**Effort**: 30 minutes (documentation update)
**Value**: Reduces maintenance burden, clarifies user experience

---

## Larger Efforts (Strategic Enhancements)

### Language Server VFS Integration

**Goal**: Enable import resolution in playground language server

**Current State**: Language server uses default file resolution
**Gap**: Playground imports don't work in Monaco LSP, limited in CodeMirror

**Implementation** (4-6 hours):

1. **Update main-browser.ts**:
```typescript
// src/language/main-browser.ts
import { VirtualFSResolver } from './import-system/module-resolver.js';
import { WorkspaceManager } from './import-system/workspace-manager.js';
import { VirtualFileSystem } from '../playground/virtual-filesystem.js';

export function startLanguageServer(vfs: VirtualFileSystem) {
  const services = createMachineServices();
  const resolver = new VirtualFSResolver(vfs);
  const workspace = new WorkspaceManager(
    services.shared.workspace.LangiumDocuments,
    resolver
  );

  // Use workspace for multi-file operations
  self.addEventListener('message', async (event) => {
    if (event.data.method === 'compile') {
      const uri = event.data.params.uri;

      try {
        await workspace.linkAll(uri);
        const entryDoc = workspace.documents.get(uri)!;
        const generator = new MultiFileGenerator();
        const merged = await generator.generate(entryDoc, workspace);

        self.postMessage({
          id: event.data.id,
          result: merged
        });
      } catch (error) {
        self.postMessage({
          id: event.data.id,
          error: { message: error.message }
        });
      }
    }
  });
}
```

2. **Update Monaco/CodeMirror clients** to pass VFS to worker

3. **Add import diagnostics** to LSP

**Effort**: 4-6 hours
**Value**: Full import support in playground with diagnostics
**Dependencies**: VFS infrastructure (already complete)

---

### Performance Optimization

**Goal**: Sub-100ms recompilation for typical multi-file projects

**Current State**: Full reparse on every change
**Gaps**:
- No module-level caching
- No incremental parsing
- No lazy loading for large graphs

**Implementation** (1-2 weeks):

1. **Module Caching**:
```typescript
// src/language/import-system/module-cache.ts
export class ModuleCache {
  private cache = new Map<string, {
    content: string;
    contentHash: string;
    parsed: Machine;
    parsedAt: number;
  }>();

  getCached(uri: string, content: string): Machine | undefined {
    const cached = this.cache.get(uri);
    if (!cached) return undefined;

    const hash = this.hashContent(content);
    if (hash !== cached.contentHash) {
      // Content changed, invalidate
      this.cache.delete(uri);
      return undefined;
    }

    return cached.parsed;
  }

  setCached(uri: string, content: string, parsed: Machine): void {
    this.cache.set(uri, {
      content,
      contentHash: this.hashContent(content),
      parsed,
      parsedAt: Date.now()
    });
  }

  private hashContent(content: string): string {
    // Simple hash - could use crypto for production
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) - hash) + content.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(36);
  }
}
```

2. **Incremental Parsing**: Reparse only changed files and dependents

3. **Lazy Loading**: Load imports on-demand for large projects

4. **Benchmarking**: Track and optimize hot paths

**Effort**: 1-2 weeks
**Value**: Essential for large multi-file projects
**Metrics**: Target less than 100ms for 10-file project, less than 500ms for 50-file project

---

### Security Hardening

**Goal**: Production-ready security for public deployments

**Current State**: Basic security (HTTPS-only URLs, no path traversal in FileSystemResolver)
**Gaps**: No resource limits, minimal CSP, no sandboxing

**Implementation** (3-5 days):

1. **Resource Limits**:
```typescript
export interface ImportSecurityConfig {
  maxImportDepth: number;        // Default: 10
  maxTotalFiles: number;         // Default: 100
  maxFileSize: number;           // Default: 1MB
  maxCompilationTime: number;    // Default: 10s
  trustedDomains: string[];
}

export class SecurityEnforcer {
  constructor(private config: ImportSecurityConfig) {}

  async validateImport(
    uri: URI,
    depth: number,
    totalFiles: number
  ): Promise<void> {
    if (depth > this.config.maxImportDepth) {
      throw new Error(`Import depth limit exceeded: ${depth} > ${this.config.maxImportDepth}`);
    }

    if (totalFiles > this.config.maxTotalFiles) {
      throw new Error(`Total file limit exceeded: ${totalFiles} > ${this.config.maxTotalFiles}`);
    }
  }

  async validateFileContent(content: string): Promise<void> {
    if (content.length > this.config.maxFileSize) {
      throw new Error(`File size limit exceeded: ${content.length} > ${this.config.maxFileSize}`);
    }
  }
}
```

2. **CSP Headers** for playground:
```typescript
// vite.config.ts
export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy':
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-eval'; " +
        "connect-src 'self' https://raw.githubusercontent.com https://cdn.jsdelivr.net; " +
        "style-src 'self' 'unsafe-inline';"
    }
  }
});
```

3. **Sandboxed Execution**: For playground, run untrusted code in iframe/worker

**Effort**: 3-5 days
**Value**: Required for public hosting
**Compliance**: OWASP Top 10 coverage

---

### Advanced Import Features

**Goal**: Enhanced import capabilities for complex projects

**Not Yet Implemented**:

1. **Module Prefixes** (`import * as auth`):
```dygram
import * as auth from "./auth.dygram"

machine "App" {
  start -> auth.LoginTask -> auth.ValidateUser -> end;
}
```

2. **Re-exports**:
```dygram
export { LoginTask, LogoutTask } from "./auth.dygram"
export { UserProfile, UserSettings } from "./user.dygram"
```

3. **Type-only imports**:
```dygram
import type { UserType, SessionType } from "./types.dygram"
```

4. **Private symbols**:
```dygram
private node _InternalHelper { ... }
```

**Effort**: 2-4 weeks total
**Value**: Enables larger, more modular projects
**Priority**: Post-v1.0 (Phase 8)

---

### Package Manager Integration

**Goal**: npm-like package management for DyGram

**Vision**:
```bash
dygram init                    # Create dygram.json
dygram install @dygram/auth    # Install package
dygram publish                 # Publish to registry
```

**Components**:
1. `dygram.json` manifest
2. Version resolution algorithm
3. Lock file (`dygram.lock`)
4. Package registry (CDN or custom)
5. CLI commands

**Effort**: 4-6 weeks
**Value**: Ecosystem enabler
**Priority**: Post-v1.0 (Phase 8)

---

## Testing Gaps

**Current State**: 1,223 tests (1,156 passing), 69 import tests passing
**Coverage**: Unit tests for all components, integration tests for examples

**Gaps**:

1. **Performance Tests**: No benchmarks for large projects
2. **Security Tests**: No fuzzing or penetration tests
3. **E2E Tests**: No browser automation tests for playground
4. **Stress Tests**: No tests with 100+ file projects

**Recommendations**:
```typescript
// test/performance/large-project.test.ts
describe('Performance: Large Projects', () => {
  it('should compile 50-file project in <500ms', async () => {
    const start = Date.now();
    await workspace.linkAll('main.dygram');
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('should handle 100 concurrent imports', async () => {
    // Stress test
  });
});
```

**Effort**: 1-2 weeks for comprehensive test suite
**Value**: Confidence for production deployment

---

## Documentation Gaps

**Current State**: Comprehensive docs for Phases 1-6
**Complete**:
- ✅ IMPORT_SYSTEM_DESIGN.md (high-level)
- ✅ IMPORT_SYSTEM_LOW_LEVEL_DESIGN.md (detailed spec)
- ✅ IMPORT_SYSTEM_IMPLEMENTATION_SUMMARY.md (what's built)
- ✅ IMPORT_SYSTEM_INTEGRATION.md (tools/codegen)
- ✅ PLAYGROUND_IMPORT_INTEGRATION.md (playground analysis)
- ✅ docs/syntax/imports.md (user-facing syntax)
- ✅ docs/examples/imports.md (comprehensive examples)

**Gaps**:
1. **Migration Guide**: How to convert single-file to multi-file
2. **Best Practices**: Code organization, file structure
3. **Troubleshooting**: Common errors and solutions
4. **API Reference**: Programmatic usage of import system

**Effort**: 1-2 days
**Value**: User adoption and support reduction

---

## Summary of Recommendations

### Immediate (This Week)
1. ✅ **Fix Codex P0 Errors** (Done - committed)
2. ⏳ **Watch Mode** (2-3 hours)
3. ⏳ **Import Navigation** (1-2 hours)
4. ⏳ **URL Caching** (2-3 hours)
5. ⏳ **Monaco Decision** (30 min - deprecate)

**Total Immediate Work**: ~6-9 hours

### Short-term (Next 2 Weeks)
1. Language Server VFS Integration (4-6 hours)
2. Documentation completion (1-2 days)
3. Security hardening phase 1 (CSP, limits) (2-3 days)

### Medium-term (Next Month)
1. Performance optimization (1-2 weeks)
2. Comprehensive test suite (1-2 weeks)
3. Security hardening phase 2 (sandboxing, audits) (1 week)

### Long-term (Post-v1.0)
1. Advanced import features (2-4 weeks)
2. Package manager (4-6 weeks)
3. Ecosystem tooling

---

## Success Criteria

**v0.5 (Current - Production CLI)**:
- ✅ CLI commands work for multi-file projects
- ✅ Playground has basic VFS support
- ✅ All import examples compile
- ✅ Zero compilation errors

**v0.6 (Recommended Next)**:
- ✅ Watch mode functional
- ✅ Import navigation in playground
- ✅ URL imports cached and secure
- ✅ Monaco deprecated or at parity
- ✅ Full documentation

**v0.7 (Performance & Security)**:
- ✅ Sub-100ms recompilation for 10-file projects
- ✅ Resource limits enforced
- ✅ CSP headers configured
- ✅ Comprehensive test coverage

**v1.0 (Production-Ready)**:
- ✅ Language server VFS integration
- ✅ All security hardening complete
- ✅ Performance benchmarks met
- ✅ Full E2E test suite

**v1.x (Ecosystem)**:
- ✅ Module prefixes
- ✅ Re-exports
- ✅ Package manager
- ✅ Registry ecosystem

---

## Conclusion

The import system is **production-ready for CLI usage** today. The quick wins (watch mode, import navigation, URL caching) are high-value and implementable in a single day.

The larger efforts (language server integration, performance, security) are important for production playground deployment but not blocking for CLI users.

**Recommendation**: Implement quick wins first, then proceed with strategic enhancements based on user feedback and adoption metrics.
