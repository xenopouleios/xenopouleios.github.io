import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";

let handler;
let allowed = true;
let existingAccount = false;
let linkFailure = false;
let generatedTypes = [];
const accountId = "00000000-0000-0000-0000-000000001016";
const applicationId = "00000000-0000-0000-0000-000000001100";
globalThis.Deno = {
  env: { get: () => "synthetic-server-value" },
  serve: callback => { handler = callback; },
};
globalThis.__invitationTestClient = () => ({
  auth: {
    getUser: async token => token === "synthetic-admin" ? { data: { user: { id: accountId } } } : { data: {}, error: { code: "invalid_token" } },
    admin: { generateLink: async ({ type }) => {
      generatedTypes.push(type);
      if (existingAccount && type === "invite") return { error: { code: "email_exists" }, data: {} };
      return { data: { user: { id: accountId }, properties: { action_link: "https://example.test/synthetic-activation" } } };
    } },
  },
  rpc: async (name, args) => {
    if (name === "is_site_admin") return { data: allowed };
    if (name === "membership_invitation") {
      if (args.account_id && linkFailure) return { error: { code: "42501", message: "PRIVATE-SENTINEL" } };
      return { data: { email: "synthetic@example.test", full_name: "Synthetic", member_code: "4091" } };
    }
    throw new Error("Unexpected invitation RPC");
  },
});
const source = await readFile(new URL("./supabase/functions/member-invitation/index.ts", import.meta.url), "utf8");
const stub = `data:text/javascript,${encodeURIComponent("export const createClient = (...args) => globalThis.__invitationTestClient(...args);")}`;
const { code } = await transformWithEsbuild(source.replace("npm:@supabase/supabase-js@2.109.0", stub), "index.ts", { loader: "ts", target: "es2022" });
await import(`data:text/javascript,${encodeURIComponent(code)}`);
const request = (token = "synthetic-admin", body = { application_id: applicationId }) => new Request("https://example.test/invitation", {
  method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
});

test("invitation function checks actual auth and administrator permission before private lookup", async () => {
  assert.equal((await handler(request(null))).status, 401);
  assert.equal((await handler(request("invalid"))).status, 401);
  allowed = false;
  assert.equal((await handler(request())).status, 403);
  allowed = true;
  assert.deepEqual(generatedTypes, []);
  assert.equal((await handler(request("synthetic-admin", { application_id: "invalid" }))).status, 400);
});
test("invitation produces a manual activation link only after server-side account linking", async () => {
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal((await response.json()).activation_url, "https://example.test/synthetic-activation");
  assert.deepEqual(generatedTypes, ["invite"]);
});
test("existing approved accounts get recovery links and failed linking never exposes the link", async () => {
  generatedTypes = [];
  existingAccount = true;
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(generatedTypes, ["invite", "recovery"]);
  linkFailure = true;
  const failed = await handler(request());
  assert.equal(failed.status, 409);
  const text = await failed.text();
  assert.ok(!text.includes("synthetic-activation"));
  assert.ok(!text.includes("PRIVATE-SENTINEL"));
});
