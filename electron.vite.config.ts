import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/preload/index.ts"),
        output: {
          // sandbox'lı preload CommonJS gerektirir; dosya adı main'deki
          // referansla (index.js) eşleşir.
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "~": resolve(__dirname, "src/renderer"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          accounts: resolve(__dirname, "src/renderer/accounts.html"),
          add: resolve(__dirname, "src/renderer/add.html"),
          settings: resolve(__dirname, "src/renderer/settings.html"),
        },
      },
    },
  },
});
