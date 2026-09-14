import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore nas_storage directory and json database to prevent full page reloads when backend saves pins/cases
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/nas_storage/**', '**/nas_storage/database.json', '**/*.json', '**/uploads/**']
      },
    },
  };
});
