import { defineConfig } from 'vite';

export default defineConfig({
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