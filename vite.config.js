import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { validatePublicConfig } from "./config.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  validatePublicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return {
    base: "./",
    build: {
      rollupOptions: {
        input: {
          website: resolve(import.meta.dirname, "index.html"),
          admin: resolve(import.meta.dirname, "admin", "index.html"),
        },
      },
    },
  };
});
