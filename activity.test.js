import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const website = await readFile(new URL("./website.js", import.meta.url), "utf8");
const admin = await readFile(new URL("./admin.js", import.meta.url), "utf8");
const privateAdmin = await readFile(new URL("./activity-admin.js", import.meta.url), "utf8");
const database = await readFile(new URL("./supabase/activities.sql", import.meta.url), "utf8");

test("activity cards link to details with category-specific registration forms", () => {
  assert.match(website, /"Διαβάστε περισσότερα →"/);
  assert.match(website, /createNode\("a", undefined, "activity-card"\)/);
  assert.match(website, /\["child_name", "Ονοματεπώνυμο παιδιού"/);
  assert.match(website, /\["guardian_name", "Ονοματεπώνυμο γονέα"/);
  assert.match(website, /\["full_name", "Ονοματεπώνυμο"/);
  assert.match(website, /client\.rpc\("activity_register"/);
  assert.match(website, /VITE_ACTIVITY_REGISTRATIONS_ENABLED/);
  assert.match(website, /Προεπισκόπηση — δεν καταχωρίζονται δηλώσεις συμμετοχής/);
  assert.match(website, /"activity-content"/);
  assert.match(website, /"ΠΡΟΣΕΧΩΣ"/);
  assert.match(website, /"ΣΥΝΑΝΤΗΣΕΙΣ ΤΟΥ ΔΙΚΤΥΟΥ"/);
});

test("activity publishing controls summaries and registration availability", () => {
  assert.match(admin, /Λίγα λόγια για την κάρτα/);
  assert.match(admin, /cardSections\.has\(post\.section\)/);
  assert.match(admin, /Οι δηλώσεις συμμετοχής είναι ανοικτές/);
  assert.match(admin, /mountActivityAdmin/);
  assert.match(privateAdmin, /activity_registrations/);
  assert.match(privateAdmin, /activity_registration_delete/);
});

test("registrations stay private with duplicate and permission protection", () => {
  assert.match(database, /create table xenopouleio_private\.activity_registrations/);
  assert.match(database, /unique \(activity_id, phone_key\)/);
  assert.match(database, /on conflict \(activity_id, phone_key\) do nothing/);
  assert.match(database, /if not public\.is_site_admin\(\)/);
  assert.match(database, /revoke all on xenopouleio_private\.activity_registrations from public, anon, authenticated/);
  assert.match(database, /grant execute on function public\.activity_register\(uuid,jsonb\) to anon, authenticated/);
});
