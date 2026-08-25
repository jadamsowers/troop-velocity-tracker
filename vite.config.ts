import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import scoutbookLogin from './plugins/vite-plugin-scoutbook-login'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    scoutbookLogin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      workbox: {
        // Don't intercept these paths with the SPA navigateFallback — they are
        // served by the Node server in the combined container (login helper,
        // credential-replay endpoint, scouting.org proxy, health check) and
        // must reach the network, not the precached tracker index.html.
        navigateFallbackDenylist: [
          /^\/token(\/|$)/,
          /^\/api\//,
          /^\/scouting-api\//,
          /^\/healthz$/,
        ],
      },
      manifest: {
        name: 'Velocity Tracker',
        short_name: 'Velocity',
        description: 'Track Scout advancement progress from Scoutbook',
        theme_color: '#1e293b',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      // Proxy all Scoutbook API calls to avoid CORS in dev
      '/scouting-api': {
        target: 'https://api.scouting.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/scouting-api/, ''),
        secure: true,
      },
    },
  },
})
