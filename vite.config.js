import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    allowedHosts: ['trudy-overgloomy-jeannie.ngrok-free.dev', 'localhost'],
    proxy: {
      '/ws': {
        target: 'ws://localhost:8081',
        ws: true,
      },
    },
  },
});