import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import doableSourceAnnotations from "./.doable/vite-plugin-source-annotations.js";


export default defineConfig({
  plugins: [
    doableSourceAnnotations(),react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
  },
});
