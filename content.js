export const sections = [
  ["bibliothiki", "Ξενοπούλειος Παιδική Βιβλιοθήκη"],
  ["daneistiki", "Δανειστική βιβλιοθήκη"],
  ["draseis-paidia", "Δράσεις για παιδιά"],
  ["draseis-enilikes", "Δράσεις για εκπαιδευτικούς και ενήλικες"],
  ["mouseio", "Μουσείο Ξενόπουλου"],
  ["xenopoulos-ergo", "Ζωή και έργο του Ξενόπουλου"],
  ["filoi", "Ο σύλλογός μας"],
  ["synergasies-foreis", "Φορείς με τους οποίους συνεργαζόμαστε"],
  ["ekdiloseis", "Εκδηλώσεις που διοργανώνονται από κοινού"],
  ["freinet", "Δίκτυο Freinet"],
  ["nea", "Νέα - Ανακοινώσεις"],
  ["stigmes-draseon", "Στιγμές από προηγούμενες δράσεις"],
  ["epikoinonia", "Επικοινωνία"],
];

export const navigation = [
  ["Η Βιβλιοθήκη", [["bibliothiki", "Παρουσίαση της Ξενοπουλείου"], ["daneistiki", "Δανεισμός βιβλίων"]]],
  ["Δράσεις", [["draseis-paidia", "Για παιδιά"], ["draseis-enilikes", "Για εκπαιδευτικούς και ενήλικες"]]],
  ["Μουσείο Ξενόπουλου", [["mouseio", "Παρουσίαση του μουσείου"], ["xenopoulos-ergo", "Ζωή και έργο του Ξενόπουλου"]]],
  ["Ο Σύλλογος", [["filoi", "Ποιοι είμαστε"]]],
  ["Συνεργασίες - Εκδηλώσεις", [["synergasies-foreis", "Φορείς με τους οποίους συνεργαζόμαστε"], ["ekdiloseis", "Εκδηλώσεις που διοργανώνονται από κοινού"]]],
  ["Δίκτυο Freinet", "freinet"],
  ["Νέα - Ανακοινώσεις", "nea"],
  ["Επικοινωνία", "epikoinonia"],
];
export const activitySections = new Set(["draseis-paidia", "draseis-enilikes"]);
export const cardSections = new Set([...activitySections, "freinet"]);
export const ageRangeSections = new Set(["draseis-paidia", "freinet"]);
export const requiresEventDate = post => post.section === "ekdiloseis"
  || post.section === "freinet"
  || (activitySections.has(post.section) && (post.activity_period ?? "upcoming") === "upcoming");
const hiddenNavigationSections = new Set(["stigmes-draseon"]);

export const homeFields = [
  ["site-name", ".brand-name", "Όνομα ιστοσελίδας"],
  ["site-tagline", ".brand-caption", "Μικρή φράση κάτω από το όνομα"],
  ["welcome", ".hero .eyebrow", "Μήνυμα καλωσορίσματος"],
  ["hero-title", "#hero-title", "Μεγάλος τίτλος της αρχικής"],
  ["hero-description", ".hero-description", "Εισαγωγικό κείμενο"],
  ["hero-button", ".button-label", "Κείμενο κεντρικού κουμπιού"],
  ["hero-note", ".hero-note-text", "Μικρή φράση κάτω από το κουμπί"],
  ["art-caption", ".art-caption", "Λεζάντα κεντρικής εικόνας"],
  ["discover-label", ".section-heading .eyebrow", "Μικρός τίτλος παρουσίασης"],
  ["discover-title", "#discover-title", "Τίτλος παρουσίασης ενοτήτων"],
  ["discover-description", ".section-heading > p", "Περιγραφή παρουσίασης"],
  ["band-text", ".intro-band p", "Κεντρικό μήνυμα στη χρωματιστή λωρίδα"],
  ["band-label", ".band-label", "Λέξεις στη χρωματιστή λωρίδα"],
  ["notice", ".site-notice p", "Ενημερωτικό μήνυμα στο κάτω μέρος"],
  ["footer-name", ".footer-name", "Όνομα στο υποσέλιδο"],
  ["footer-description", ".footer-description", "Φράση στο υποσέλιδο"],
];

export function sectionFields(id) {
  const fields = [
    [`${id}-title`, `#${id} h2`, "Τίτλος ενότητας"],
    [`${id}-body`, `#${id} .detail-body`, "Κείμενο ενότητας"],
  ];
  if (!hiddenNavigationSections.has(id)) fields.unshift([`${id}-nav`, `nav a[data-section="${id}"]`, "Όνομα στην επάνω μπάρα"]);
  if (["bibliothiki", "mouseio", "filoi", "freinet"].includes(id)) {
    fields.push(
      [`${id}-card-title`, `.card[data-section="${id}"] h3`, "Τίτλος κάρτας στην αρχική"],
      [`${id}-card-body`, `.card[data-section="${id}"] p`, "Περιγραφή κάρτας στην αρχική"],
      [`${id}-card-link`, `.card[data-section="${id}"] .card-link`, "Κείμενο συνδέσμου κάρτας"],
    );
  }
  return fields;
}

export const allFields = [...homeFields, ...sections.flatMap(([id]) => sectionFields(id))];
const legacyContactSections = ["topothesia", "forma-epikoinonias"];
const legacyRemovedSections = ["mouseio-episkepseis"];
const legacySections = [...legacyContactSections, ...legacyRemovedSections];
const legacyNoteIds = [...sections.map(([id]) => `${id}-note`), ...legacySections.map(id => `${id}-note`)];
const legacySectionLabelIds = [...sections.map(([id]) => `${id}-label`), ...legacySections.map(id => `${id}-label`)];
const legacyCardLabelIds = ["bibliothiki", "mouseio", "filoi", "freinet"].map(id => `${id}-card-label`);
const legacyContactDefaults = new Set([
  "Τα στοιχεία επικοινωνίας θα προστεθούν μόλις επιβεβαιωθούν από τους υπευθύνους.",
  "Η διεύθυνση και οι πληροφορίες πρόσβασης στο Ξενοπούλειο θα παρουσιαστούν εδώ.",
  "Η φόρμα επικοινωνίας θα προστεθεί αφού επιβεβαιωθούν ο παραλήπτης και ο τρόπος διαχείρισης των μηνυμάτων.",
]);
const legacyNavigation = {
  bibliothiki: "Ξενοπούλειος Παιδική Βιβλιοθήκη",
  daneistiki: "Δανειστική βιβλιοθήκη",
  mouseio: "Μουσείο Ξενόπουλου",
  filoi: "Ο σύλλογός μας",
  freinet: "Δίκτυο Freinet",
  ekdiloseis: "Συνεργασίες - Εκδηλώσεις",
  nea: "Νέα - Ανακοινώσεις",
  epikoinonia: "Επικοινωνία",
};
export const emptyContent = () => ({ fields: {}, images: {}, posts: [], activity_archive_overrides: {} });
export const maxImageBytes = 5 * 1024 * 1024;
export const imageTypes = ["image/jpeg", "image/png", "image/webp"];

export function validateImage(file) {
  if (!imageTypes.includes(file.type)) throw new Error("Επιλέξτε εικόνα JPG, PNG ή WebP.");
  if (file.size > maxImageBytes) throw new Error("Η εικόνα είναι μεγαλύτερη από 5 MB. Επιλέξτε μικρότερη εικόνα.");
  if (file.size === 0) throw new Error("Το αρχείο της εικόνας είναι κενό.");
}

export function safeImageUrl(value) {
  if (typeof value !== "string") throw new Error("Μη έγκυρη διεύθυνση εικόνας.");
  if (value === "") return "";
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Μη έγκυρη διεύθυνση εικόνας.");
  return url.href;
}

export function validateContent(content) {
  if (!content || typeof content !== "object" || Array.isArray(content)) throw new Error("Μη έγκυρο περιεχόμενο.");
  if (!content.fields || !content.images || !Array.isArray(content.posts)) throw new Error("Λείπουν στοιχεία περιεχομένου.");
  if (typeof content.fields !== "object" || Array.isArray(content.fields) || typeof content.images !== "object" || Array.isArray(content.images)) throw new Error("Μη έγκυρα πεδία περιεχομένου.");
  const archiveOverrides = content.activity_archive_overrides ?? {};
  if (!archiveOverrides || typeof archiveOverrides !== "object" || Array.isArray(archiveOverrides) || Object.keys(archiveOverrides).length > 1000) throw new Error("Μη έγκυρες αλλαγές αρχείου δράσεων.");
  for (const [id, override] of Object.entries(archiveOverrides)) {
    if (!/^\d{1,30}$/.test(id) || !override || typeof override !== "object" || Array.isArray(override)) throw new Error("Μη έγκυρη αλλαγή αρχειακής δράσης.");
    const allowedFields = new Set(["hidden", "title", "date", "event_date", "summary", "image", "alt", "body", "audience"]);
    if (Object.keys(override).some(key => !allowedFields.has(key)) || typeof override.hidden !== "boolean") throw new Error("Μη έγκυρο πεδίο αρχειακής δράσης.");
    if (override.hidden) continue;
    if (typeof override.title !== "string" || !override.title.trim() || override.title.length > 300
      || typeof override.summary !== "string" || !override.summary.trim() || override.summary.length > 500
      || typeof override.body !== "string" || !override.body.trim() || override.body.length > 50000
      || typeof override.alt !== "string" || override.alt.length > 500
      || !["children", "adults"].includes(override.audience)) throw new Error("Μη έγκυρη αρχειακή δράση.");
    if (typeof override.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(override.date) || !Number.isFinite(Date.parse(override.date)) || new Date(override.date).toISOString().slice(0, 10) !== override.date) throw new Error("Μη έγκυρη ημερομηνία αρχειακής ανάρτησης.");
    if (override.event_date !== undefined && (typeof override.event_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(override.event_date) || !Number.isFinite(Date.parse(override.event_date)) || new Date(override.event_date).toISOString().slice(0, 10) !== override.event_date)) throw new Error("Μη έγκυρη ημερομηνία αρχειακής δράσης.");
    safeImageUrl(override.image);
  }
  const fieldIds = new Set([...allFields.map(([id]) => id), ...legacySections.flatMap(id => sectionFields(id).map(([fieldId]) => fieldId)), ...legacyNoteIds, ...legacySectionLabelIds, ...legacyCardLabelIds, "stigmes-draseon-nav"]);
  for (const [id, value] of Object.entries(content.fields)) {
    if (!fieldIds.has(id) || typeof value !== "string" || value.length > 20000) throw new Error("Μη έγκυρο πεδίο κειμένου.");
  }
  const imageIds = new Set(["logo", "hero", ...sections.map(([id]) => id), ...legacySections]);
  for (const [id, image] of Object.entries(content.images)) {
    if (!imageIds.has(id) || !image || typeof image.alt !== "string" || image.alt.length > 500) throw new Error("Μη έγκυρη εικόνα.");
    safeImageUrl(image.url);
  }
  if (content.posts.length > 500) throw new Error("Επιτρέπονται έως 500 αναρτήσεις.");
  const ids = new Set();
  for (const post of content.posts) {
    if (!post || typeof post.id !== "string" || ids.has(post.id) || ![...sections.map(([id]) => id), ...legacySections].includes(post.section)) throw new Error("Μη έγκυρη ανάρτηση.");
    ids.add(post.id);
    const allowedPostFields = new Set(["id", "section", "title", "body", "date", "event_date", "image", "alt", "summary", "registration_open", "age_range", "activity_period"]);
    if (Object.keys(post).some(key => !allowedPostFields.has(key))) throw new Error("Μη έγκυρο πεδίο ανάρτησης.");
    if (typeof post.title !== "string" || !post.title.trim() || post.title.length > 300 || typeof post.body !== "string" || !post.body.trim() || post.body.length > 50000 || typeof post.alt !== "string" || post.alt.length > 500) throw new Error("Συμπληρώστε τίτλο και κείμενο στην ανάρτηση.");
    if (typeof post.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !Number.isFinite(Date.parse(post.date)) || new Date(post.date).toISOString().slice(0, 10) !== post.date) throw new Error("Μη έγκυρη ημερομηνία.");
    if (post.event_date !== undefined && (![...cardSections, "ekdiloseis"].includes(post.section) || typeof post.event_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(post.event_date) || !Number.isFinite(Date.parse(post.event_date)) || new Date(post.event_date).toISOString().slice(0, 10) !== post.event_date)) throw new Error("Μη έγκυρη ημερομηνία διεξαγωγής.");
    if (typeof post.image !== "string") throw new Error("Μη έγκυρη φωτογραφία ανάρτησης.");
    if (post.summary !== undefined && (!cardSections.has(post.section) || typeof post.summary !== "string" || !post.summary.trim() || post.summary.length > 500)) throw new Error("Μη έγκυρη σύντομη περιγραφή κάρτας.");
    if (post.registration_open !== undefined && (!activitySections.has(post.section) || typeof post.registration_open !== "boolean")) throw new Error("Μη έγκυρη κατάσταση συμμετοχών.");
    if (post.age_range !== undefined && (!ageRangeSections.has(post.section) || typeof post.age_range !== "string" || post.age_range.length > 100)) throw new Error("Μη έγκυρες ηλικίες δράσης.");
    if (post.activity_period !== undefined && (!activitySections.has(post.section) || !["upcoming", "previous"].includes(post.activity_period))) throw new Error("Μη έγκυρη κατηγορία δράσης.");
    safeImageUrl(post.image);
  }
  return content;
}

export function normalizeContent(content, defaults = {}) {
  const normalized = structuredClone(content);
  normalized.activity_archive_overrides ??= {};
  for (const [id, label] of Object.entries(legacyNavigation)) {
    if (normalized.fields[`${id}-nav`] === label) delete normalized.fields[`${id}-nav`];
  }
  for (const [id] of sections) {
    const bodyId = `${id}-body`;
    const noteId = `${id}-note`;
    const bodyValue = normalized.fields[bodyId] ?? defaults[bodyId] ?? "";
    const body = bodyValue.trim();
    const note = normalized.fields[noteId]?.trim();
    if (note) normalized.fields[bodyId] = body ? `${bodyValue}\n\n${normalized.fields[noteId]}` : normalized.fields[noteId];
    delete normalized.fields[noteId];
  }
  for (const id of legacySectionLabelIds) delete normalized.fields[id];
  for (const id of legacyCardLabelIds) delete normalized.fields[id];
  delete normalized.fields["stigmes-draseon-nav"];
  const storedContactBody = normalized.fields["epikoinonia-body"]?.trim();
  const contactParts = [storedContactBody && !legacyContactDefaults.has(storedContactBody) ? normalized.fields["epikoinonia-body"] : defaults["epikoinonia-body"] ?? ""].filter(Boolean);
  for (const id of legacyContactSections) {
    const body = normalized.fields[`${id}-body`]?.trim();
    if (body && !legacyContactDefaults.has(body) && !contactParts.includes(body)) contactParts.push(body);
    for (const [fieldId] of sectionFields(id)) delete normalized.fields[fieldId];
    delete normalized.fields[`${id}-note`];
    if (!normalized.images.epikoinonia && normalized.images[id]) normalized.images.epikoinonia = normalized.images[id];
    delete normalized.images[id];
  }
  for (const id of legacyRemovedSections) {
    for (const [fieldId] of sectionFields(id)) delete normalized.fields[fieldId];
    delete normalized.fields[`${id}-note`];
    delete normalized.fields[`${id}-label`];
    delete normalized.images[id];
  }
  if (contactParts.length) normalized.fields["epikoinonia-body"] = contactParts.join("\n\n");
  normalized.posts = normalized.posts.filter(post => !legacyRemovedSections.includes(post.section)).map(post => {
    if (legacyContactSections.includes(post.section)) return { ...post, section: "epikoinonia" };
    const normalizedPost = { ...post };
    if (cardSections.has(post.section)) {
      normalizedPost.summary = post.summary ?? post.body.replace(/\s+/g, " ").trim().slice(0, 240);
      if (activitySections.has(post.section)) {
        normalizedPost.activity_period = post.activity_period ?? "upcoming";
        normalizedPost.registration_open = post.registration_open === true;
      }
    }
    if (!requiresEventDate(normalizedPost)) delete normalizedPost.event_date;
    return normalizedPost;
  });
  return normalized;
}

export function readDefaults(document) {
  for (const [id] of sections) {
    document.querySelectorAll(`a[href="#${id}"], a[href="./${id}.html"]`).forEach(link => {
      link.dataset.section = id;
    });
    const section = document.querySelector(`#${id}`);
    if (!section) throw new Error(`Δεν βρέθηκε η ενότητα: ${id}`);
    let body = section.querySelector(".detail-body") || section.querySelector("p");
    if (!body) {
      body = document.createElement("p");
      section.querySelector("div:last-child").append(body);
    }
    body.classList.add("detail-body");
  }
  return Object.fromEntries(allFields.map(([id, selector]) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Δεν βρέθηκε το πεδίο: ${id}`);
    const copy = element.cloneNode(true);
    copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
    return [id, copy.textContent.trim()];
  }));
}
