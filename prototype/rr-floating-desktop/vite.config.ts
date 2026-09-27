import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Radar images and callout polygons are read from the main app (apps/web, apps/api) rather than copied.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: ['../..'] },
  },
})
