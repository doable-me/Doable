
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
    plugins: [viteSingleFile()],
    build: {
        target: "esnext",
        assetsInlineLimit: 100000000,
        chunkSizeWarningLimit: 100000000,
        cssCodeSplit: false,
        reportCompressedSize: false,
        rollupOptions: {
            input: "src/mcp-app.html",
            output: {
                inlineDynamicImports: true,
                manualChunks: undefined,
            },
        },
        outDir: "dist",
        emptyOutDir: false,
    },
});
