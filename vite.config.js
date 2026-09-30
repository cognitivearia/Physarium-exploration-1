import { defineConfig } from "vite";

// GitHub Pages publica la rama main desde la raíz del repo.
// El sitio construido vive en /docs, así que las rutas llevan ese prefijo.
export default defineConfig({
  root: "site",
  base: "/Physarium-exploration-1/docs/",
  build: {
    outDir: "../docs",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});
