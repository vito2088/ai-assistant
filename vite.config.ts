import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/.tmp-edge-profile/**', '**/src-tauri/target/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13', rollupOptions: { input: { main: 'index.html', ...((process.env.TAURI_ENV_PLATFORM ?? (process.platform === 'win32' ? 'windows' : process.platform)) === 'windows' ? {} : { systemCapture: 'system-capture.html' }), pinned: 'capture-pin.html', reminder: 'reminder.html' } } },
});
