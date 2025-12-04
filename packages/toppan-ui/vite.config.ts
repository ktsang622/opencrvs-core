import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3889,
    host: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  // Expose all env vars (not just VITE_ prefixed) to the client
  envPrefix: ['VITE_', 'TOPPAN_', 'APPLICATION_']
})