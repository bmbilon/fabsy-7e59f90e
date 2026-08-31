import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { fingerprint, LEGAL_SOURCE_DOCUMENT_PATHS } from "./src/i18n/locale-policy.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __FABSY_LEGAL_SOURCE_HASHES__: JSON.stringify(Object.fromEntries(
      LEGAL_SOURCE_DOCUMENT_PATHS.map(file => [file, fingerprint(fs.readFileSync(path.resolve(__dirname, file), "utf8"))]),
    )),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
