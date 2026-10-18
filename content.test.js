import test from "node:test";
import assert from "node:assert/strict";
import { activitySections, ageRangeSections, allFields, cardSections, emptyContent, maxImageBytes, navigation, normalizeContent, requiresEventDate, safeImageUrl, sections, usesAgeRange, validateContent, validateImage } from "./content.js";
import { validatePublicConfig } from "./config.js";

const post = () => ({ id: "test-1", section: "nea", title: "Νέα ανακοίνωση", body: "Το κείμενό μας.", date: "2026-10-15", image: "", alt: "" });

test("baseline and all editable sections are accepted", () => {
  assert.deepEqual(validateContent(emptyContent()), emptyContent());
  assert.equal(new Set(allFields.map(([id]) => id)).size, allFields.length);
  assert.equal(sections.length, 13);
  const menuPages = navigation.flatMap(([, item]) => typeof item === "string" ? [item] : item.map(([id]) => id));
  assert.equal(navigation.length, 8);
  assert.deepEqual(new Set(menuPages), new Set(sections.map(([id]) => id).filter(id => id !== "stigmes-draseon")));
  assert.equal(menuPages.includes("stigmes-draseon"), false);
  assert.equal(menuPages.length, sections.length - 1);
  assert.equal(allFields.some(([id]) => id === "stigmes-draseon-nav"), false);
  const content = emptyContent();
  for (const [id] of allFields) content.fields[id] = "Κείμενο";
  content.posts = [post()];
  assert.equal(validateContent(content), content);
});

test("removed museum visits content is accepted and discarded", () => {
  const content = emptyContent();
  content.fields["mouseio-episkepseis-body"] = "Παλιές πληροφορίες επισκέψεων";
  content.images["mouseio-episkepseis"] = { url: "", alt: "" };
  content.posts = [{ ...post(), section: "mouseio-episkepseis" }];
  assert.doesNotThrow(() => validateContent(content));
  const normalized = normalizeContent(content);
  assert.equal(Object.hasOwn(normalized.fields, "mouseio-episkepseis-body"), false);
  assert.equal(Object.hasOwn(normalized.images, "mouseio-episkepseis"), false);
  assert.equal(normalized.posts.length, 0);
});

test("legacy contact pages are merged into the single contact page", () => {
  const content = emptyContent();
  content.fields["epikoinonia-body"] = "Κύριο κείμενο";
  content.fields["topothesia-body"] = "Οδηγίες πρόσβασης";
  content.fields["forma-epikoinonias-body"] = "Παλαιό κείμενο φόρμας";
  content.posts = [{ ...post(), section: "topothesia" }];
  assert.doesNotThrow(() => validateContent(content));
  const normalized = normalizeContent(content);
  assert.equal(normalized.fields["epikoinonia-body"], "Κύριο κείμενο\n\nΟδηγίες πρόσβασης\n\nΠαλαιό κείμενο φόρμας");
  assert.equal(Object.hasOwn(normalized.fields, "topothesia-body"), false);
  assert.equal(normalized.posts[0].section, "epikoinonia");
});

test("activity posts support card summaries and controlled registration", () => {
  const activity = {
    ...post(),
    section: "draseis-paidia",
    event_date: "2026-10-20",
    activity_period: "previous",
    summary: "Μια σύντομη παρουσίαση της δράσης.",
    registration_open: true,
    age_range: "6–10 ετών",
  };
  const content = emptyContent();
  content.posts = [activity];
  assert.equal(validateContent(content), content);
  assert.deepEqual(activitySections, new Set(["draseis-paidia", "draseis-enilikes"]));
  assert.deepEqual(cardSections, new Set(["draseis-paidia", "draseis-enilikes", "freinet"]));
  assert.deepEqual(ageRangeSections, new Set(["draseis-paidia", "freinet"]));
  const legacy = emptyContent();
  legacy.posts = [{ ...post(), section: "draseis-enilikes", body: "Αναλυτικό κείμενο παλιότερης δράσης." }];
  const normalized = normalizeContent(legacy);
  assert.equal(Object.hasOwn(normalized.posts[0], "event_date"), false);
  assert.equal(normalized.posts[0].activity_period, "upcoming");
  assert.equal(normalized.posts[0].summary, "Αναλυτικό κείμενο παλιότερης δράσης.");
  assert.equal(normalized.posts[0].registration_open, false);
  assert.equal(requiresEventDate(normalized.posts[0]), true);
  assert.equal(usesAgeRange({ ...activity, activity_period: "upcoming" }), true);
  assert.equal(usesAgeRange({ ...activity, activity_period: "previous" }), false);
  assert.equal(requiresEventDate({ ...activity, activity_period: "previous" }), false);
  const previous = normalizeContent({ ...content, posts: [{ ...activity, activity_period: "previous" }] }).posts[0];
  assert.equal(Object.hasOwn(previous, "event_date"), false);
  assert.equal(Object.hasOwn(previous, "age_range"), false);
  assert.equal(requiresEventDate({ ...post(), section: "ekdiloseis" }), true);
  assert.equal(requiresEventDate({ ...post(), section: "freinet" }), true);
  assert.equal(requiresEventDate(post()), false);
  assert.throws(() => validateContent({ ...content, posts: [{ ...activity, summary: "" }] }));
  assert.throws(() => validateContent({ ...content, posts: [{ ...activity, registration_open: "yes" }] }));
  assert.throws(() => validateContent({ ...content, posts: [{ ...activity, age_range: "α".repeat(101) }] }));
  assert.throws(() => validateContent({ ...content, posts: [{ ...activity, activity_period: "past" }] }));
  assert.throws(() => validateContent({ ...content, posts: [{ ...activity, section: "draseis-enilikes" }] }));
  const freinet = emptyContent();
  freinet.posts = [{ ...post(), section: "freinet", body: "Αναλυτικό κείμενο του Δικτύου Freinet.", event_date: "2026-10-22", age_range: "Εκπαιδευτικοί και γονείς" }];
  assert.equal(validateContent(freinet), freinet);
  const normalizedFreinet = normalizeContent(freinet).posts[0];
  assert.equal(normalizedFreinet.summary, "Αναλυτικό κείμενο του Δικτύου Freinet.");
  assert.equal(Object.hasOwn(normalizedFreinet, "age_range"), false);
  assert.throws(() => validateContent({ ...freinet, posts: [{ ...freinet.posts[0], registration_open: true }] }));
  assert.throws(() => validateContent({ ...freinet, posts: [{ ...freinet.posts[0], age_range: "α".repeat(101) }] }));
  assert.throws(() => validateContent({ ...freinet, posts: [{ ...freinet.posts[0], event_date: "22/10/2026" }] }));
  const jointEvent = emptyContent();
  jointEvent.posts = [{ ...post(), section: "ekdiloseis", event_date: "2026-10-24" }];
  assert.equal(validateContent(jointEvent), jointEvent);
});

test("malformed documents and unknown fields are rejected", () => {
  for (const value of [null, [], {}, {fields: [], images: {}, posts: []}]) assert.throws(() => validateContent(value));
  const content = emptyContent();
  content.fields.unknown = "value";
  assert.throws(() => validateContent(content));
});

test("archived activity overrides support website-only edits and deletions", () => {
  const content = emptyContent();
  content.activity_archive_overrides["123"] = {
    hidden: false,
    title: "Διορθωμένος τίτλος",
    date: "2026-10-18",
    event_date: "2026-10-17",
    summary: "Διορθωμένη σύντομη περιγραφή.",
    image: "https://example.com/activity.jpg",
    alt: "Περιγραφή φωτογραφίας",
    body: "Διορθωμένο αναλυτικό κείμενο.",
    audience: "children",
  };
  content.activity_archive_overrides["456"] = { hidden: true };
  assert.equal(validateContent(content), content);
  assert.throws(() => validateContent({ ...content, activity_archive_overrides: { abc: { hidden: true } } }));
  assert.throws(() => validateContent({ ...content, activity_archive_overrides: { 123: { ...content.activity_archive_overrides["123"], audience: "all" } } }));
  assert.throws(() => validateContent({ ...content, activity_archive_overrides: { 123: { ...content.activity_archive_overrides["123"], image: "http://example.com/activity.jpg" } } }));
});

test("text is treated as text, not HTML", () => {
  const content = emptyContent();
  content.fields["hero-title"] = '<script>alert("test")</script>';
  assert.equal(validateContent(content).fields["hero-title"], '<script>alert("test")</script>');
});

test("legacy additional updates are merged into the single section text", () => {
  const content = emptyContent();
  content.fields["bibliothiki-body"] = "Πρώτο κείμενο";
  content.fields["bibliothiki-note"] = "Δεύτερο κείμενο";
  assert.doesNotThrow(() => validateContent(content));
  const normalized = normalizeContent(content);
  assert.equal(normalized.fields["bibliothiki-body"], "Πρώτο κείμενο\n\nΔεύτερο κείμενο");
  assert.equal(Object.hasOwn(normalized.fields, "bibliothiki-note"), false);
  assert.equal(content.fields["bibliothiki-note"], "Δεύτερο κείμενο");
  const noteOnly = emptyContent();
  noteOnly.fields["bibliothiki-note"] = "Δεύτερο κείμενο";
  assert.equal(normalizeContent(noteOnly, { "bibliothiki-body": "Αρχικό κείμενο" }).fields["bibliothiki-body"], "Αρχικό κείμενο\n\nΔεύτερο κείμενο");
});

test("legacy section headings are discarded in favor of optional images", () => {
  const content = emptyContent();
  content.fields["mouseio-label"] = "02 / ΜΝΗΜΗ";
  content.fields["mouseio-card-label"] = "02 / ΜΝΗΜΗ";
  assert.doesNotThrow(() => validateContent(content));
  const normalized = normalizeContent(content);
  assert.equal(Object.hasOwn(normalized.fields, "mouseio-label"), false);
  assert.equal(Object.hasOwn(normalized.fields, "mouseio-card-label"), false);
  assert.equal(allFields.some(([id]) => id.endsWith("-label") && sections.some(([section]) => id === `${section}-label`)), false);
  assert.equal(allFields.some(([id]) => id.endsWith("-card-label")), false);
});

test("images must use HTTPS and known slots", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com/photo.jpg", "//example.com/photo.jpg"]) assert.throws(() => safeImageUrl(url));
  assert.equal(safeImageUrl(""), "");
  assert.equal(safeImageUrl("https://example.com/photo.jpg"), "https://example.com/photo.jpg");
  const content = emptyContent();
  content.images.unknown = { url: "https://example.com/photo.jpg", alt: "Εικόνα" };
  assert.throws(() => validateContent(content));
});

test("image upload accepts exact 5 MB limit and rejects larger files and SVG", () => {
  assert.doesNotThrow(() => validateImage({type: "image/jpeg", size: maxImageBytes}));
  assert.throws(() => validateImage({type: "image/jpeg", size: maxImageBytes + 1}));
  assert.throws(() => validateImage({type: "image/svg+xml", size: 100}));
  assert.throws(() => validateImage({type: "image/png", size: 0}));
});

test("posts require valid sections, text, dates, unique ids, and image URLs", () => {
  for (const change of [{ section: "invalid" }, { title: " " }, { body: "" }, { date: "not-a-date" }, {date: "2026-02-30"}, { image: "javascript:alert(1)" }, { alt: null }]) {
    const content = emptyContent();
    content.posts = [{...post(), ...change}];
    assert.throws(() => validateContent(content));
  }
  const content = emptyContent();
  content.posts = [post(), post()];
  assert.throws(() => validateContent(content));
});

test("configuration requires both public values and rejects privileged keys", () => {
  assert.equal(validatePublicConfig("", ""), false);
  assert.throws(() => validatePublicConfig("https://example.supabase.co", ""));
  assert.throws(() => validatePublicConfig("", "sb_publishable_example_public_key"));
  assert.equal(validatePublicConfig("https://example.supabase.co", "sb_publishable_example_public_key"), true);
  assert.throws(() => validatePublicConfig("http://example.supabase.co", "sb_publishable_example_public_key"));
  assert.throws(() => validatePublicConfig("https://example.supabase.co", "sb_secret_not_allowed"));
  const jwt = role => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({role}))}.test`;
  assert.equal(validatePublicConfig("https://example.supabase.co", jwt("anon")), true);
  assert.throws(() => validatePublicConfig("https://example.supabase.co", jwt("service_role")));
});

test("post and text limits are enforced", () => {
  const content = emptyContent();
  content.fields["hero-title"] = "a".repeat(20001);
  assert.throws(() => validateContent(content));
  content.fields = {};
  content.posts = Array.from({length: 501}, (_, index) => ({...post(), id: String(index)}));
  assert.throws(() => validateContent(content));
});
