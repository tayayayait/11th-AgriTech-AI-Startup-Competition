import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: command === "serve" ? [react()] : [],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  // ── 감사보고서 #2: lucide-react 배럴 임포트 최적화 ──
  optimizeDeps: {
    include: ["lucide-react"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/lucide-react")) return "vendor-icons";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) return "vendor-react";
          if (id.includes("node_modules/@tanstack")) return "vendor-query";
          if (id.includes("node_modules/@radix-ui")) return "vendor-radix";
        },
      },
    },
  },
}));

