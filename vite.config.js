import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      // Proxy API calls to the backend running on port 3000
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
        // keep the /api prefix
        rewrite: (path) => path
      }
    }
  }
});
