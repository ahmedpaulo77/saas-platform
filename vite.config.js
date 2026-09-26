import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ include: /\.(jsx|js|ts|tsx)$/ })],
  // لا تضف define: { 'process.env': process.env } هنا — ده بيعوّض process.env
  // بسnapshot لكل متغيرات بيئة السيرفر وبي把它们 داخل الـ bundle العام.
  // قيم Firebase بتقرأ من import.meta.env (شوف src/firebase/config.js).
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage', 'firebase/messaging'],
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          export: ['jspdf', 'jspdf-autotable', 'xlsx', 'html2canvas'],
        },
      },
    },
  },
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
      plugins: [
        {
          name: 'load-js-files-as-jsx',
          setup(build) {
            build.onLoad({ filter: /src\/.*\.js$/ }, async (args) => {
              const fs = await import('fs');
              const contents = await fs.promises.readFile(args.path, 'utf8');
              return { contents, loader: 'jsx' };
            });
          },
        },
      ],
    },
  },
});
