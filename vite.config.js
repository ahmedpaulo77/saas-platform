import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react({ include: /\.(jsx|js|ts|tsx)$/ })],
  // لا تضف define: { 'process.env': process.env } هنا — هذا يستبدل process.env
  // بلقطة لكل متغيرات بيئة السيرفر ويدخلها داخل الـ bundle العام.
  // قيم Firebase تقرأ من import.meta.env (انظر src/firebase/config.js).
  server: {
    port: 3000,
    open: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.js'],
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
