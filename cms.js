import { createClient } from "@supabase/supabase-js";
import { validateContent, validateImage } from "./content.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const client = configured ? createClient(url, key, {
  auth: { detectSessionInUrl: location.pathname.includes("/admin") },
}) : null;

export async function loadContent() {
  const { data, error } = await client.from("site_content").select("document, version").eq("id", 1).single();
  if (error) throw error;
  validateContent(data.document);
  return data;
}

export async function publishContent(document, version) {
  validateContent(document);
  const { data, error } = await client.rpc("publish_site", { content: document, expected_version: version });
  if (error) throw error;
  return data;
}

export async function uploadImage(file) {
  validateImage(file);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await client.storage.from("site-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return client.storage.from("site-images").getPublicUrl(path).data.publicUrl;
}
