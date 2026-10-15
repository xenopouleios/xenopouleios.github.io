export function validatePublicConfig(url, key) {
  if (!url && !key) return false;
  if (!url || !key) throw new Error("Συμπληρώστε και το Supabase URL και το δημόσιο publishable key.");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !["", "/"].includes(parsed.pathname)) throw new Error("Το Supabase URL πρέπει να είναι ασφαλής διεύθυνση HTTPS του έργου.");
  if (key.startsWith("sb_publishable_") && key.length > 25) return true;
  if (key.startsWith("eyJ")) {
    const parts = key.split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload.role === "anon") return true;
    }
  }
  throw new Error("Χρησιμοποιήστε μόνο δημόσιο Supabase publishable ή anon key. Ποτέ secret ή service_role key.");
}
