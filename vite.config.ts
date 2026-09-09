import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handlePayPalDevRequest } from './src/lib/paypalDevMiddleware'

function paypalDevPlugin(): Plugin {
  return {
    name: 'paypal-dev-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        handlePayPalDevRequest(req, res, next);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), paypalDevPlugin()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
