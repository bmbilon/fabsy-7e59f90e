import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { fingerprint, LEGAL_SOURCE_DOCUMENT_PATHS } from "./src/i18n/locale-policy.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // The paid-acquisition evidence build supplies an explicit, non-secret
  // synthetic browser configuration and must never inherit a developer's
  // .env files. Production and normal local builds retain the existing envDir.
  envDir: mode === "paid-acquisition-evidence"
    ? path.resolve(__dirname, "scripts/paid-acquisition-evidence-env")
    : undefined,
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
