import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const importer = await readFile(new URL("./scripts/prepare-blog.mjs", import.meta.url), "utf8");
const archive = await readFile(new URL("./blog-archive.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("./.github/workflows/pages.yml", import.meta.url), "utf8");

test("blog import sanitizes complete Blogger posts", () => {
  assert.match(importer, /sanitizeHtml\(html/);
  assert.match(importer, /allowedSchemes: \["http", "https", "mailto"\]/);
  assert.match(importer, /posts\.length !== total/);
  assert.match(importer, /blog-archive\.json/);
});

test("blog archive renders full posts in bounded pages", () => {
  assert.match(importer, /const archiveChunkSize = 6/);
  assert.match(importer, /blog-archive-\$\{index \+ 1\}\.json/);
  assert.match(archive, /content\.innerHTML = post\.content/);
  assert.match(archive, /"blog-post announcement-card"/);
  assert.match(archive, /"announcement-content"/);
  assert.match(archive, /"blog-post-content announcement-body is-collapsed"/);
  assert.match(archive, /"ΔΙΑΒΑΣΤΕ ΠΕΡΙΣΣΟΤΕΡΑ →"/);
  assert.match(archive, /Φόρτωση παλαιότερων δημοσιεύσεων/);
  assert.match(archive, /validateArchive\(archive\)/);
});

test("blog archive refreshes through a scheduled deployment", () => {
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron: "17 3 \* \* \*"/);
});
