# React + MDX Documentation System

This document describes the React + MDX documentation system implementation for DyGram.

## Overview

The project now supports creating interactive documentation pages using React components embedded in MDX (Markdown + JSX). This provides a single source of truth for documentation with interactive code examples.

## Architecture

### Technology Stack

- **React 19.2** - UI components
- **@mdx-js/rollup 3.1.1** - MDX processing
- **@vitejs/plugin-react 5.0.4** - React support in Vite
- **Vite 5.2.7** - Build tool and dev server

### Directory Structure

```
src/
├── components/
│   ├── Layout.tsx          # Page layout wrapper
│   └── CodeEditor.tsx      # Interactive code examples
└── pages/
    ├── LanguageOverview.mdx    # MDX content
    └── language-overview.tsx   # React entry point

language-overview.html          # HTML entry point
```

## Components

### Layout Component

`src/components/Layout.tsx` provides the standard page structure:

- Header with logo and navigation
- Main content area
- Footer

**Usage in MDX:**
```mdx
import { Layout } from '../components/Layout';

<Layout>
  # Your content here
</Layout>
```

### CodeEditor Component

`src/components/CodeEditor.tsx` displays interactive code examples:

**Props:**
- `initialCode: string` - The code to display
- `language?: string` - Language identifier (default: "dygram")
- `readOnly?: boolean` - Whether editor is read-only (default: false)
- `height?: string` - Editor height (default: "300px")

**Usage in MDX:**
```mdx
import { CodeEditor } from '../components/CodeEditor';

<CodeEditor
    initialCode={`machine "Example"`}
    language="dygram"
    readOnly
    height="100px"
/>
```

## Creating New Documentation Pages

### Step 1: Create MDX File

Create a new file in `src/pages/` with `.mdx` extension:

**src/pages/YourPage.mdx:**
```mdx
import { Layout } from '../components/Layout';
import { CodeEditor } from '../components/CodeEditor';

<Layout>

# Your Page Title

Content goes here...

<CodeEditor
    initialCode={`your code here`}
    language="dygram"
    readOnly
/>

</Layout>
```

### Step 2: Create React Entry Point

Create a corresponding `.tsx` file:

**src/pages/your-page.tsx:**
```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import YourPage from './YourPage.mdx';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<YourPage />);
}
```

### Step 3: Create HTML Entry Point

Create an HTML file in the root directory:

**your-page.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Page Title</title>
    <link rel="stylesheet" href="./static/styles.css">
    <style>
        /* Include the documentation styles from language-overview.html */
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="./src/pages/your-page.tsx"></script>
</body>
</html>
```

### Step 4: Update Vite Configuration

Add your page to `vite.config.ts`:

```typescript
rollupOptions: {
    input: {
        // ... existing entries
        'your-page': path.resolve(__dirname, 'your-page.html'),
    },
}
```

## Development

### Start Dev Server

```bash
npm run dev
```

Visit: `http://localhost:5173/machine/your-page.html`

### Build for Production

```bash
npm run bundle
```

Output: `dist/your-page.html`

## Benefits

### Single Source of Truth
- Write documentation once in MDX
- No manual duplication between markdown and HTML
- Content and components live together

### Interactive Examples
- Embed live React components in markdown
- CodeEditor component for syntax highlighting
- Potential for interactive demos and playgrounds

### Type Safety
- Full TypeScript support for components
- Compile-time checking for component usage
- IDE autocomplete and type hints

### Fast Development
- Hot Module Replacement (HMR)
- Instant updates during development
- Fast build times with Vite

### Maintainability
- Standard React component patterns
- Easy to extend with new components
- Clean separation of content and presentation

## Migrating Existing Documentation

To convert existing markdown documentation:

1. **Copy content** from `docs/*.md` to new `.mdx` file in `src/pages/`
2. **Add Layout wrapper**:
   ```mdx
   import { Layout } from '../components/Layout';
   <Layout>
   <!-- existing content -->
   </Layout>
   ```
3. **Replace code blocks** with CodeEditor components:
   ```mdx
   <CodeEditor
       initialCode={`code here`}
       language="dygram"
       readOnly
   />
   ```
4. **Create entry points** (React .tsx and HTML files)
5. **Update vite.config.ts** with new entry
6. **Test** with `npm run dev`

## Future Enhancements

### Planned Improvements

1. **Monaco/CodeMirror Integration**
   - Replace placeholder CodeEditor with full Monaco editor
   - Add syntax highlighting for DyGram language
   - Enable live code execution

2. **Additional Components**
   - Carousel for example navigation
   - Diagram renderer for state machines
   - Interactive tutorials

3. **Documentation Features**
   - Search functionality
   - Table of contents generation
   - Dark mode support

4. **Build Optimization**
   - Code splitting for faster loads
   - Lazy loading for large components
   - Asset optimization

## Troubleshooting

### Build Errors

**Error: "Could not resolve ..."**
- Ensure all imports use correct relative paths
- Check that imported files exist
- Run `npm run langium:generate` before building

**Error: "Module externalized for browser compatibility"**
- This is a warning, not an error
- Node.js modules (fs, path) are stubbed for browser builds
- Safe to ignore if build succeeds

### Runtime Errors

**React not rendering**
- Check that `<div id="root"></div>` exists in HTML
- Verify script tag points to correct entry file
- Check browser console for errors

**Components not styled**
- Ensure styles.css is linked in HTML
- Check that custom styles are included in `<style>` tag

## Configuration Files

### vite.config.ts

Key additions for React + MDX:

```typescript
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

export default defineConfig({
    plugins: [
        { enforce: 'pre', ...mdx() },
        react(),
        // ... other plugins
    ],
    // ... rest of config
});
```

### package.json

New dependencies:

```json
{
  "devDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^5.0.4",
    "@mdx-js/rollup": "^3.1.1",
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.1"
  }
}
```

## Resources

- [MDX Documentation](https://mdxjs.com/)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [DyGram Language Overview](./language-overview.md)

## Questions?

For questions or issues:
1. Check this documentation
2. Review the example in `src/pages/LanguageOverview.mdx`
3. Check Vite and MDX documentation
4. Open an issue in the repository
