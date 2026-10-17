import { createClient } from "npm:@supabase/supabase-js@2.109.0";

const allowedOrigins = new Set([
  "https://xenopouleios.github.io",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
]);
const limits = { name: 150, email: 254, subject: 200, message: 5000 };
const htmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function reply(status: number, body: object, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => htmlEscapes[character]);
}

async function hash(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") ?? "";
  if (!allowedOrigins.has(origin)) return new Response(null, { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" }, origin);

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return reply(400, { error: "Invalid JSON" }, origin);
  }

  if (typeof payload.website === "string" && payload.website) return reply(200, { sent: true }, origin);
  if (typeof payload.opened_at !== "number" || Date.now() - payload.opened_at < 3000 || Date.now() - payload.opened_at > 3600000) {
    return reply(400, { error: "Invalid form session" }, origin);
  }

  const name = text(payload.name, limits.name);
  const email = text(payload.email, limits.email);
  const subject = text(payload.subject, limits.subject);
  const message = text(payload.message, limits.message);
  if (!name || !email || !subject || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply(400, { error: "Invalid form fields" }, origin);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const recipient = Deno.env.get("CONTACT_TO_EMAIL");
  const sender = Deno.env.get("CONTACT_FROM_EMAIL");
  if (!url || !serviceRole || !resendKey || !recipient || !sender) {
    console.error("Contact email configuration is incomplete");
    return reply(503, { error: "Contact service unavailable" }, origin);
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = request.headers.get("cf-connecting-ip") ?? forwarded;
  if (!address) return reply(400, { error: "Client address unavailable" }, origin);
  const ipHash = await hash(`${serviceRole}:${address}`);
  const server = createClient(url, serviceRole, { auth: { persistSession: false } });
  const { data: allowed, error: rateError } = await server.rpc("allow_contact_email", { request_ip_hash: ipHash });
  if (rateError) {
    console.error("Contact rate limit failed", rateError.code);
    return reply(503, { error: "Contact service unavailable" }, origin);
  }
  if (!allowed) return reply(429, { error: "Too many messages" }, origin);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender,
      to: [recipient],
      reply_to: email,
      subject: `[Ξενοπούλειο] ${subject}`,
      text: `Ονοματεπώνυμο: ${name}\nEmail: ${email}\n\n${message}`,
      html: `<p><strong>Ονοματεπώνυμο:</strong> ${escapeHtml(name)}</p><p><strong>Email:</strong> ${escapeHtml(email)}</p><hr><p>${escapeHtml(message).replaceAll("\n", "<br>")}</p>`,
    }),
  });
  if (!response.ok) {
    console.error("Contact email provider failed", response.status);
    return reply(502, { error: "Email delivery failed" }, origin);
  }
  return reply(200, { sent: true }, origin);
});
