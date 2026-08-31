import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    server: {
      // Set DISABLE_HMR=true in constrained environments that cannot watch files.
      // HMR remains enabled by default for local development.
      hmr: process.env.DISABLE_HMR !== "true",
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;

            if (id.includes("@supabase")) return "supabase";
            return "vendor";
          },
        },
      },
    },
  };
});
