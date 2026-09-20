import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Builds the shared framework runtime once into public/framework/v1/.
// Apps load it at runtime via <script> (see src/core/sdk.ts / app bootstrap).
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/framework/v1',
    emptyOutDir: true,
    target: 'es2022',
    lib: {
      entry: resolve(__dirname, 'framework/index.ts'),
      formats: ['es'],
      fileName: () => 'gf-runtime.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
