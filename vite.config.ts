import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  worker: { format: "es" },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  build: {
    outDir: "docs",
    emptyOutDir: true,
    sourcemap: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 4000,
    target: "esnext",
  },
  preview: { port: 4174, host: "127.0.0.1", strictPort: true },
});
