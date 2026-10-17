import { defineConfig, loadEnv } from "vite";
import { resolve } from "node:path";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { validatePublicConfig } from "./config.js";
import { sections } from "./content.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, "VITE_");
  const assetVersion = process.env.GITHUB_SHA?.slice(0, 12) || "local";
  const versionAssets = html => html.replace(
    /(assets\/(?:website|library|admin)\.(?:js|css))(?=["'])/g,
    `$1?v=${assetVersion}`,
  );
  const versionJavaScriptImports = source => source.replace(
    /(\.\/(?:website|library|admin)\.js)(?=["'])/g,
    `$1?v=${assetVersion}`,
  );
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
        await Promise.all(["website.js", "library.js", "admin.js"].map(async name => {
          const path = resolve(output, "assets", name);
          await writeFile(path, versionJavaScriptImports(await readFile(path, "utf8")));
        }));
        let html = versionAssets(await readFile(resolve(output, "index.html"), "utf8"));
        for (const [id] of sections) html = html.replaceAll(`href="#${id}"`, `href="./${id}.html"`);
        await writeFile(resolve(output, "index.html"), html);
        const adminPath = resolve(output, "admin", "index.html");
        await writeFile(adminPath, versionAssets(await readFile(adminPath, "utf8")));
        await Promise.all(sections.map(async ([id, title]) => {
          const page = html.replace("<body>", `<body data-page="${id}">`)
            .replace("<title>Ξενοπούλειο — Βιβλία, μνήμη, δημιουργία</title>", `<title>${title} — Ξενοπούλειο</title>`);
          await writeFile(resolve(output, `${id}.html`), page);
        }));
        // Keep the immediately previous asset names for visitors holding cached HTML during this transition.
        await Promise.all([
          ["website.js", "website-Dr7WTfeN.js"],
          ["library.js", "library-CsMCTZtk.js"],
          ["website.css", "website-DYImzFJy.css"],
          ["library.css", "library-DhtwxyMd.css"],
          ["admin.js", "admin-GmBm2CwR.js"],
          ["admin.css", "admin-BbR9_CR5.css"],
          ["logo.png", "logo-ChW4RBXG.png"],
          ["favicon.svg", "favicon-Bmq9bexH.svg"],
        ].map(([source, alias]) => copyFile(resolve(output, "assets", source), resolve(output, "assets", alias))));
      },
    }],
    build: {
      rollupOptions: {
        input: {
          website: resolve(import.meta.dirname, "index.html"),
          admin: resolve(import.meta.dirname, "admin", "index.html"),
        },
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
  };
});
