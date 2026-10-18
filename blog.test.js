import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const importer = await readFile(new URL("./scripts/prepare-blog.mjs", import.meta.url), "utf8");
const archive = await readFile(new URL("./blog-archive.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("./.github/workflows/pages.yml", import.meta.url), "utf8");
const packageJson = await readFile(new URL("./package.json", import.meta.url), "utf8");

test("blog import sanitizes complete Blogger posts", () => {
  assert.match(importer, /sanitizeHtml\(html/);
  assert.match(importer, /allowedSchemes: \["http", "https", "mailto"\]/);
  assert.match(importer, /posts\.length !== total/);
  assert.match(importer, /blog-archive\.json/);
  assert.match(importer, /activity-archive-\$\{audience\}\.json/);
  assert.match(importer, /function eventDateFromTitle\(title, publishedDate\)/);
  assert.match(importer, /event_date: eventDate/);
  assert.match(importer, /classifyAudience\(title\)/);
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

test("blog archive is a static snapshot managed by the website admin", () => {
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(packageJson, /"refresh:blog": "node scripts\/prepare-blog\.mjs"/);
  assert.match(packageJson, /"build": "vite build"/);
  assert.doesNotMatch(packageJson, /"build": "npm run (?:prepare|refresh):blog/);
});
