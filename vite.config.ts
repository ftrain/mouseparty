/**
 * Mouse Party's two pages, from TypeScript (web/) into the folders the Go app embeds and serves (main.go), each file at
 * the path it always had, as Tiny Little Office builds its library (its vite.lib.config.ts):
 *
 *   --mode viewer  web/viewer -> host_web/: host.js (the page's own script, loaded by viewer.html) and apps/<name>.js,
 *                  one module an app, which host.js imports by URL when one opens (web.go serves apps/ by name);
 *                  what they share (apps/lib.js, and office.js for the reel) is a module of its own beside them, imported,
 *                  never copied into each. The rest of host_web (viewer.html, host.css, data.html, the vendored hls.js,
 *                  pdf.js and office/) is as it is, not built
 *   --mode window  web/window -> frontend/: app.js, the Mac app's window (frontend/index.html loads it)
 *
 * One module in, one file out (preserveModules): no bundling, no hashes, nothing minified, so the output reads as the
 * source does, less its types. What the pages fetch by URL (pdf.js, the editors, the apps) stays a dynamic import.
 */
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { defineConfig } from 'vite';

const here = import.meta.dirname;
const apps = readdirSync(resolve(here, 'web/viewer/apps')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const pages: Record<string, { root: string; out: string; entries: string[] }> = {
    viewer: { root: 'web/viewer', out: 'host_web', entries: ['host.ts', ...apps.map((f) => `apps/${f}`)] },
    window: { root: 'web/window', out: 'frontend', entries: ['app.ts'] },
};

export default defineConfig(({ mode }) => {
    const page = pages[mode];
    if (!page) throw new Error(`vite build --mode viewer or --mode window, not ${mode}`);
    const root = resolve(here, page.root);
    return {
        root,
        publicDir: false,
        logLevel: 'warn',
        build: {
            outDir: resolve(here, page.out),
            emptyOutDir: false, // the folder holds the pages' HTML, CSS and vendored files too
            copyPublicDir: false,
            target: 'es2022',
            minify: false,
            reportCompressedSize: false,
            // a library's build: its dynamic imports are left as they are written (a page's would load through a preload helper)
            lib: {
                entry: Object.fromEntries(page.entries.map((e) => [e.replace(/\.ts$/, ''), resolve(root, e)])),
                formats: ['es' as const],
            },
            rollupOptions: {
                // an app's default export is what host.js takes from it
                preserveEntrySignatures: 'strict' as const,
                // No "//#region <path>" notes, which name where the modules were on the building machine.
                experimental: { attachDebugInfo: 'none' as const },
                // const stays const: host.js and app.js are classic scripts, where a top-level var would be a property of window
                output: {
                    preserveModules: true,
                    preserveModulesRoot: root,
                    entryFileNames: '[name].js',
                    topLevelVar: false,
                    // what it's built from, for anyone who opens the file to change it
                    banner: (chunk: { facadeModuleId: string | null }) =>
                        chunk.facadeModuleId ? `// Built from ${relative(here, chunk.facadeModuleId)} by \`npm run build\` (vite.config.ts): change it there.` : '',
                },
            },
        },
    };
});
