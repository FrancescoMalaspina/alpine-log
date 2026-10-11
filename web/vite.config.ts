import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /alpine-log/; the deploy workflow sets
  // VITE_BASE. Local dev and builds stay at the root.
  base: process.env.VITE_BASE ?? '/',
})
