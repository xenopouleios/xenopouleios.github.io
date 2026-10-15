import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { validatePublicConfig } from "./config.js";
import { sections } from "./content.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  validatePublicConfig(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  return {
    base: "./",
    plugins: [{
      name: "section-pages",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url, "http://localhost");
          const id = url.pathname.split("/").pop().replace(/\.html$/, "");
          if (sections.some(([section]) => section === id)) request.url = `/index.html${url.search}`;
          next();
        });
      },
      async writeBundle() {
        const output = resolve(import.meta.dirname, "dist");
        let html = await readFile(resolve(output, "index.html"), "utf8");
        for (const [id] of sections) html = html.replaceAll(`href="#${id}"`, `href="./${id}.html"`);
        await writeFile(resolve(output, "index.html"), html);
        await Promise.all(sections.map(async ([id, title]) => {
          const page = html.replace("<body>", `<body data-page="${id}">`)
            .replace("<title>Ξενοπούλειο — Βιβλία, μνήμη, δημιουργία</title>", `<title>${title} — Ξενοπούλειο</title>`);
          await writeFile(resolve(output, `${id}.html`), page);
        }));
      },
    }],
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
