import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // Proxy API + WebSocket to backend
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        ws:     true,
        changeOrigin: true,
      },
    },
  },
  build: {
    target:    'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three:    ['three'],
          gsap:     ['gsap'],
          socketio: ['socket.io-client'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'gsap', 'socket.io-client'],
    exclude: ['@mediapipe/hands', '@mediapipe/camera_utils'],
  },
});
