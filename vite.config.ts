import { defineConfig, type Plugin } from 'vite';

/**
 * Inlines every emitted JS/CSS chunk into index.html so the game ships as a
 * single self-contained file (used for Artifact previews and offline sharing).
 * Kept in-repo instead of a third-party plugin to avoid an extra dependency
 * chain (see docs/adr/ADR-006-build-and-deploy.md).
 */
function inlineSingleFile(): Plugin {
  return {
    name: 'jonron-inline-single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find(
        (f) => f.type === 'asset' && f.fileName.endsWith('.html'),
      );
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && name.endsWith('.js')) {
          const tag = new RegExp(`<script type="module" crossorigin src="[^"]*${escape(name)}"></script>`);
          const code = chunk.code.replace(/<\/script/gi, '<\\/script');
          source = source.replace(tag, () => `<script type="module">${code}</script>`);
          delete bundle[name];
        } else if (chunk.type === 'asset' && name.endsWith('.css')) {
          const tag = new RegExp(`<link rel="stylesheet" crossorigin href="[^"]*${escape(name)}">`);
          source = source.replace(tag, () => `<style>${String(chunk.source)}</style>`);
          delete bundle[name];
        }
      }
      html.source = source;
    },
  };
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: single ? [inlineSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      target: 'es2022',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      cssCodeSplit: !single,
      chunkSizeWarningLimit: 1200,
      rollupOptions: single ? { output: { inlineDynamicImports: true } } : {},
    },
    test: {
      include: ['tests/unit/**/*.test.ts'],
      environment: 'node',
    },
  };
});
