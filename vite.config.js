import { defineConfig } from "vite";

// La acción de GitHub Pages publica la carpeta docs como raíz del sitio.
export default defineConfig({
  root: "site",
  base: "/Physarium-exploration-1/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
