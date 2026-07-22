import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Relative base so the built app works when loaded via file:// (Capacitor
// WebView and Electron both load index.html straight off disk).
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  // @sqlite.org/sqlite-wasm (used by src/lib/persistence/web.ts) ships its
  // own WASM/worker assets that esbuild's dependency pre-bundling mangles,
  // and it needs ES-module-format workers — both are the package's own
  // documented Vite integration requirements, not something specific to
  // this app.
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  worker: {
    format: 'es'
  }
});
