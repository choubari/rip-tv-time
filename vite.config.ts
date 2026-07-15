import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";

// One `vite dev` runs the React client AND the Cloudflare Worker (with a local
// D1 database via Miniflare). `vite build` emits the client to dist/client and
// the Worker bundle that `wrangler deploy` ships.
export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "rip tv time",
        short_name: "rip tv time",
        description: "Browse your exported TV Time watch history.",
        theme_color: "#21d07a",
        background_color: "#0f0f0f",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});
