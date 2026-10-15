export const sections = [
  ["bibliothiki", "Ξενοπούλειος Παιδική Βιβλιοθήκη"],
  ["daneistiki", "Δανειστική βιβλιοθήκη"],
  ["mouseio", "Μουσείο Ξενόπουλου"],
  ["filoi", "Ο σύλλογός μας"],
  ["freinet", "Δίκτυο Freinet"],
  ["ekdiloseis", "Συνεργασίες - Εκδηλώσεις"],
  ["nea", "Νέα - Ανακοινώσεις"],
  ["epikoinonia", "Επικοινωνία"],
];

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
    [`${id}-nav`, `nav a[href="#${id}"]`, "Όνομα στην επάνω μπάρα"],
    [`${id}-title`, `#${id} h2`, "Τίτλος ενότητας"],
    [`${id}-label`, `#${id} .detail-label`, "Μικρή επικεφαλίδα"],
    [`${id}-body`, `#${id} .detail-body`, "Κείμενο ενότητας"],
    [`${id}-note`, `#${id} .coming`, "Πρόσθετη ενημέρωση (προαιρετική)"],
  ];
  if (["bibliothiki", "mouseio", "filoi", "freinet"].includes(id)) {
    fields.push(
      [`${id}-card-title`, `.card[href="#${id}"] h3`, "Τίτλος κάρτας στην αρχική"],
      [`${id}-card-body`, `.card[href="#${id}"] p`, "Περιγραφή κάρτας στην αρχική"],
      [`${id}-card-label`, `.card[href="#${id}"] .card-number`, "Μικρή επικεφαλίδα κάρτας"],
      [`${id}-card-link`, `.card[href="#${id}"] .card-link`, "Κείμενο συνδέσμου κάρτας"],
    );
  }
  return fields;
}

export const allFields = [...homeFields, ...sections.flatMap(([id]) => sectionFields(id))];
export const emptyContent = () => ({ fields: {}, images: {}, posts: [] });
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
  const fieldIds = new Set(allFields.map(([id]) => id));
  for (const [id, value] of Object.entries(content.fields)) {
    if (!fieldIds.has(id) || typeof value !== "string" || value.length > 20000) throw new Error("Μη έγκυρο πεδίο κειμένου.");
  }
  const imageIds = new Set(["logo", "hero", ...sections.map(([id]) => id)]);
  for (const [id, image] of Object.entries(content.images)) {
    if (!imageIds.has(id) || !image || typeof image.alt !== "string" || image.alt.length > 500) throw new Error("Μη έγκυρη εικόνα.");
    safeImageUrl(image.url);
  }
  if (content.posts.length > 500) throw new Error("Επιτρέπονται έως 500 αναρτήσεις.");
  const ids = new Set();
  for (const post of content.posts) {
    if (!post || typeof post.id !== "string" || ids.has(post.id) || !sections.some(([id]) => id === post.section)) throw new Error("Μη έγκυρη ανάρτηση.");
    ids.add(post.id);
    if (typeof post.title !== "string" || !post.title.trim() || post.title.length > 300 || typeof post.body !== "string" || !post.body.trim() || post.body.length > 50000 || typeof post.alt !== "string" || post.alt.length > 500) throw new Error("Συμπληρώστε τίτλο και κείμενο στην ανάρτηση.");
    if (typeof post.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) || !Number.isFinite(Date.parse(post.date)) || new Date(post.date).toISOString().slice(0, 10) !== post.date) throw new Error("Μη έγκυρη ημερομηνία.");
    if (typeof post.image !== "string") throw new Error("Μη έγκυρη φωτογραφία ανάρτησης.");
    safeImageUrl(post.image);
  }
  return content;
}

export function readDefaults(document) {
  for (const [id] of sections) {
    const section = document.querySelector(`#${id}`);
    if (!section) throw new Error(`Δεν βρέθηκε η ενότητα: ${id}`);
    let body = section.querySelector(".detail-body") || section.querySelector("p:not(.coming)");
    if (!body) {
      body = document.createElement("p");
      section.querySelector(".coming").before(body);
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
