import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  // Tools built with this app's React/Vite stack live under `tools/<name>/`
  // and are wired up as lazy-loaded routes in src/App.tsx, so they don't
  // need an entry here. Add an entry here only for a tool that's a separate
  // build (a different stack entirely, e.g. Rust/WASM) with its own
  // index.html, linked from the sidebar as an "external" nav item.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
      },
    },
  },
})
