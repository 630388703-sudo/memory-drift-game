import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/memory-drift-game/" : "/",
  plugins: [react()],
  publicDir: false,
  build: { outDir: "gh-pages", emptyOutDir: true, sourcemap: false },
});
