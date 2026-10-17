import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("./index.html", import.meta.url), "utf8");
const website = await readFile(new URL("./website.js", import.meta.url), "utf8");
const functionSource = await readFile(new URL("./supabase/functions/contact-email/index.ts", import.meta.url), "utf8");
const database = await readFile(new URL("./supabase/contact.sql", import.meta.url), "utf8");

test("contact form uses a free-text subject and links only public addresses", () => {
  assert.match(page, /name="subject" type="text"/);
  assert.doesNotMatch(page, /name="recipient"/);
  assert.match(website, /publicContactEmails/);
  assert.match(website, /client\.functions\.invoke\("contact-email"/);
  assert.match(website, /VITE_CONTACT_EMAIL_ENABLED/);
  assert.doesNotMatch(website, /mailto:\$\{recipient\}/);
});

test("contact recipient remains server-side with validation and rate limiting", () => {
  assert.match(functionSource, /Deno\.env\.get\("CONTACT_TO_EMAIL"\)/);
  assert.match(functionSource, /Deno\.env\.get\("RESEND_API_KEY"\)/);
  assert.match(functionSource, /server\.rpc\("allow_contact_email"/);
  assert.match(functionSource, /allowedOrigins/);
  assert.match(functionSource, /escapeHtml/);
  assert.match(database, /request_count <= 5/);
  assert.match(database, /grant execute on function public\.allow_contact_email\(text\) to service_role/);
});
