import { createClient } from "npm:@supabase/supabase-js@2.109.0";

const site = "https://xenopouleios.github.io";
const cors = { "Access-Control-Allow-Origin": site, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Cache-Control": "no-store" };
const reply = (status: number, body: object) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reply(401, { error: "Authentication required" });
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data: user, error: authError } = await userClient.auth.getUser(authorization.slice(7));
  if (authError || !user.user) return reply(401, { error: "Authentication required" });
  const { data: allowed, error: permissionError } = await userClient.rpc("is_site_admin");
  if (permissionError || !allowed) return reply(403, { error: "Administrator required" });
  let applicationId: string;
  try {
    const body = await request.json();
    if (typeof body.application_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.application_id)) return reply(400, { error: "Invalid application" });
    applicationId = body.application_id;
  } catch {
    return reply(400, { error: "Invalid JSON" });
  }
  const server = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: application, error: lookupError } = await server.rpc("membership_invitation", { application_id: applicationId });
  if (lookupError) return reply(409, { error: "Approved application required" });
  const options = { redirectTo: `${site}/daneistiki.html` };
  let generated = await server.auth.admin.generateLink({ type: "invite", email: application.email, options });
  if (generated.error?.code === "email_exists") {
    generated = await server.auth.admin.generateLink({ type: "recovery", email: application.email, options });
  }
  if (generated.error || !generated.data.user || !generated.data.properties?.action_link) {
    console.error("Member invitation generation failed", generated.error?.code ?? "missing_result");
    return reply(502, { error: "Invitation could not be generated" });
  }
  const { error: linkError } = await server.rpc("membership_invitation", {
    application_id: applicationId, account_id: generated.data.user.id,
  });
  if (linkError) {
    console.error("Member account linking failed", linkError.code);
    return reply(409, { error: "Account could not be linked" });
  }
  return reply(200, { ...application, activation_url: generated.data.properties.action_link });
});
