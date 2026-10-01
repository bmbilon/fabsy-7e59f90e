import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

const site = path.resolve(__dirname, 'ontario/anderhue-paralegal-site');

// Two private app entries for anderhue.ca. Static public pages are copied
// next to them by scripts/build-anderhue.mjs.
//   client.html -> /start and /files (client intake and file portal)
//   portal.html -> /sign-in and /admin (practice staff workspace)
export default defineConfig({
  root: site,
  envDir: __dirname,
  publicDir: false,
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { fs: { allow: [__dirname] } },
  build: {
    outDir: path.resolve(__dirname, 'dist-anderhue'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        client: path.resolve(site, 'client.html'),
        portal: path.resolve(site, 'portal.html'),
      },
    },
  },
});
