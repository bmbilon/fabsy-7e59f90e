// A separate dev-only entry and client alias keep fixtures out of production.
import { createServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  configFile: false,
  root,
  plugins: [
    react(),
    {
      name: "overview-preview-entry",
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.headers.accept?.includes("text/html"))
            req.url = "/scripts/admin-overview-preview/index.html";
          next();
        });
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: resolve(root, "scripts/admin-overview-preview/client.ts"),
      },
      { find: "@", replacement: resolve(root, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: Number(process.env.ADMIN_PREVIEW_PORT || 4193), strictPort: true },
});
await server.listen();
console.log(
  `Synthetic dashboard preview: http://127.0.0.1:${process.env.ADMIN_PREVIEW_PORT || 4193}/admin/dashboard`,
);
