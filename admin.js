import { client, configured, loadContent, publishContent, uploadImage } from "./cms.js";
import { activitySections, emptyContent, homeFields, normalizeContent, readDefaults, sectionFields, sections, validateContent, validateImage } from "./content.js";
import logoUrl from "./logo.png";
import { mountLibraryAdmin } from "./library-admin.js";
import { mountMembersAdmin } from "./members-admin.js";
import { mountLendingAdmin } from "./lending-admin.js";
import { mountActivityAdmin } from "./activity-admin.js";
import { createUndoHistory } from "./admin-history.js";
import "./library.css";

const $ = id => document.getElementById(id);
let content = emptyContent();
let defaults = {};
let version = 0;
let dirty = false;
let demo = false;
let active = "home";
let userId = null;
let busy = false;
let bookDirty = false;
let disposeLibrary = null;
let memberDirty = false;
let disposeMembers = null;
const linkType = new URLSearchParams(location.hash.slice(1)).get("type");
let recovery = linkType === "recovery" || linkType === "invite";
const previewId = crypto.randomUUID();
const activityRegistrationsEnabled = import.meta.env.VITE_ACTIVITY_REGISTRATIONS_ENABLED === "true";
const undoHistory = createUndoHistory();
const contentEditors = () => active === "home" || active === "posts" || sections.some(([id]) => id === active);

function message(text, kind = "") {
  $("status").textContent = text;
  $("status").className = `message ${kind}`;
  $("status").hidden = false;
  $("status").setAttribute("role", kind === "error" ? "alert" : "status");
  $("status").scrollIntoView({ behavior: "auto", block: "nearest" });
}

function describeError(error) {
  if (error.code === "40001") return "Η εγγραφή άλλαξε από άλλο διαχειριστή. Οι δικές σας αλλαγές δεν αποθηκεύτηκαν. Κρατήστε αντίγραφο των στοιχείων σας και φορτώστε ξανά την εγγραφή πριν δοκιμάσετε ξανά.";
  if (error.code === "42501") return "Ο λογαριασμός σας δεν έχει δικαίωμα δημοσίευσης. Επικοινωνήστε με τον υπεύθυνο.";
  if (error.code === "invalid_credentials") return "Το email ή ο κωδικός δεν είναι σωστά. Ελέγξτε τα και δοκιμάστε ξανά.";
  if (error.code === "over_email_send_rate_limit" || error.status === 429) return "Έγιναν πολλές προσπάθειες. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.";
  if (error.name === "AuthSessionMissingError" || error.status === 401) return "Η σύνδεσή σας έληξε. Συνδεθείτε ξανά. Οι αλλαγές σας δεν δημοσιεύτηκαν.";
  if (error instanceof TypeError) return "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε το διαδίκτυο και δοκιμάστε ξανά. Οι αλλαγές σας δεν δημοσιεύτηκαν.";
  return `Δεν ολοκληρώθηκε η ενέργεια. ${error.message || "Δοκιμάστε ξανά ή ενημερώστε τον υπεύθυνο."}`;
}

async function run(action) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll("button, input, textarea, select")]
    .filter(element => !element.closest("#confirm-dialog"))
    .map(element => [element, element.disabled]);
  controls.forEach(([element]) => { element.disabled = true; });
  try {
    await action();
  } catch (error) {
    console.error("Admin action failed", error);
    message(describeError(error), "error");
  } finally {
    busy = false;
    controls.forEach(([element, disabled]) => { element.disabled = disabled; });
    updateState();
  }
}

function updateState() {
  $("publish").disabled = demo || !dirty || busy;
  $("preview").disabled = busy || bookDirty || ["members", "lending", "activity-registrations"].includes(active);
  $("undo").disabled = busy || !undoHistory.canUndo || !contentEditors() || bookDirty || memberDirty;
  $("save-state").textContent = demo ? "Δοκιμή μόνο — δεν γίνεται αποθήκευση." : memberDirty
    ? `Το μέλος δεν αποθηκεύτηκε ακόμη. Πατήστε «Αποθήκευση μέλους — ιδιωτικά».${dirty ? " Υπάρχουν επίσης αδημοσίευτες αλλαγές στα κείμενα." : ""}`
    : bookDirty
    ? `Το βιβλίο δεν αποθηκεύτηκε ακόμη. Πατήστε «Αποθήκευση βιβλίου — δημόσια».${dirty ? " Υπάρχουν επίσης αδημοσίευτες αλλαγές στα κείμενα." : ""}`
    : dirty ? "Έχετε αλλαγές που δεν δημοσιεύτηκαν ακόμη." : "Δεν υπάρχουν αδημοσίευτες αλλαγές.";
}

function changed() {
  dirty = true;
  updateState();
}

function rememberChange(group) {
  undoHistory.remember(content, dirty, group);
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(label, action, className = "secondary") {
  const node = element("button", label, className);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function field(container, id, label, value, onInput, { multiline = false, type = "text", maxLength = 20000, required = false } = {}) {
  const name = `field-${id}`;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.id = name;
  if (!multiline) input.type = type;
  input.value = value;
  input.maxLength = maxLength;
  input.required = required;
  if (multiline) input.rows = 5;
  const caption = element("label", label);
  caption.htmlFor = name;
  const undoGroup = `field-${id}`;
  input.addEventListener("input", () => {
    rememberChange(undoGroup);
    onInput(input.value);
    changed();
  });
  input.addEventListener("blur", () => undoHistory.endGroup(undoGroup));
  container.append(caption, input);
  return input;
}

function confirmAction(text, title = "Να συνεχίσουμε;") {
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  $("confirm-dialog").returnValue = "";
  $("confirm-dialog").showModal();
  return new Promise(resolve => {
    const dialog = $("confirm-dialog");
    function finish(confirmed) {
      dialog.removeEventListener("click", select);
      dialog.removeEventListener("close", cancel);
      dialog.close();
      resolve(confirmed);
    }
    function select(event) {
      const choice = event.target.closest("button[value]");
      if (!choice) return;
      event.preventDefault();
      finish(choice.value === "confirm");
    }
    function cancel() { finish(false); }
    dialog.addEventListener("click", select);
    dialog.addEventListener("close", cancel);
  });
}

async function loadDefaults() {
  const response = await fetch("../index.html", { cache: "no-cache" });
  if (!response.ok) throw new Error("Δεν φορτώθηκε η αρχική σελίδα. Δοκιμάστε ανανέωση.");
  defaults = readDefaults(new DOMParser().parseFromString(await response.text(), "text/html"));
}

function renderImage(container, id, label, initialUrl = "") {
  const block = element("div", undefined, "image-editor");
  block.append(element("h3", label));
  const current = content.images[id];
  const url = current?.url || initialUrl;
  if (url) {
    const image = element("img");
    image.src = url;
    image.alt = current?.alt || label;
    block.append(image);
  }
  const input = element("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  input.id = `image-${id}`;
  input.disabled = demo;
  const caption = element("label", "Επιλέξτε φωτογραφία από τη συσκευή σας");
  caption.htmlFor = input.id;
  block.append(caption, input, element("span", demo ? "Η μεταφόρτωση ενεργοποιείται μετά τη σύνδεση με το Supabase." : "JPG, PNG ή WebP, έως 5 MB. Η εικόνα εμφανίζεται δημόσια μόνο όταν δημοσιεύσετε, αλλά το αρχείο αποθηκεύεται σε δημόσιο χώρο: μην ανεβάζετε ευαίσθητα ή ιδιωτικά δεδομένα.", "hint"));
  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;
    run(async () => {
      validateImage(file);
      const url = await uploadImage(file);
      rememberChange(`image-upload-${id}-${crypto.randomUUID()}`);
      content.images[id] = { url, alt: current?.alt || "" };
      changed();
      renderEditor(false);
      message("Η εικόνα ανέβηκε. Γράψτε μια σύντομη περιγραφή και πατήστε «Δημοσίευση αλλαγών» όταν είστε έτοιμοι.");
    });
  });
  if (current) {
    field(block, `${id}-alt`, "Σύντομη περιγραφή εικόνας (για άτομα που δεν μπορούν να τη δουν)", current.alt, value => { content.images[id].alt = value; }, { maxLength: 500 });
    block.append(button(initialUrl || id === "hero" ? "Επαναφορά αρχικής εικόνας" : "Αφαίρεση εικόνας", () => {
      rememberChange(`image-remove-${id}-${crypto.randomUUID()}`);
      delete content.images[id];
      changed();
      renderEditor(false);
    }));
  }
  container.append(block);
}

function showWorkspace() {
  $("setup").hidden = true;
  $("login-panel").hidden = true;
  $("recovery-panel").hidden = true;
  $("workspace").hidden = false;
  $("demo-notice").hidden = !demo;
  $("logout").textContent = demo ? "Τέλος δοκιμής" : "Αποσύνδεση";
  $("account-label").textContent = demo ? "Γνωρίστε τη διαχείριση χωρίς να αλλάξει η ιστοσελίδα." : "Κάθε αλλαγή δημοσιεύεται μόνο όταν το επιλέξετε εσείς.";
  const buttons = $("section-buttons");
  buttons.replaceChildren();
  for (const [id, label] of [["home", "Αρχική σελίδα και λογότυπο"], ...sections, ["books", "Βιβλία και έλεγχος καταλόγου"], ["members", "Μέλη — ιδιωτικό μητρώο"], ["lending", "Εγγραφές και δανεισμοί"], ["activity-registrations", "Δηλώσεις δράσεων — ιδιωτικά"]]) {
    const item = button(label, () => selectEditor(id), "section-button");
    item.dataset.section = id;
    buttons.append(item);
  }
  renderEditor();
  updateState();
}

async function selectEditor(id) {
  if (busy) return;
  if (bookDirty && !await confirmAction("Οι αλλαγές του βιβλίου δεν αποθηκεύτηκαν. Να αλλάξουμε ενότητα χωρίς αποθήκευση;", "Μη αποθηκευμένο βιβλίο")) return;
  if (memberDirty && !await confirmAction("Οι αλλαγές του μέλους δεν αποθηκεύτηκαν. Να αλλάξουμε ενότητα χωρίς αποθήκευση;", "Μη αποθηκευμένο μέλος")) return;
  active = id;
  renderEditor();
}

function renderEditor(focus = true) {
  undoHistory.endGroup();
  disposeLibrary?.();
  disposeLibrary = null;
  disposeMembers?.();
  disposeMembers = null;
  const root = $("editor");
  root.classList.remove("library-catalog");
  root.replaceChildren();
  document.querySelectorAll(".section-button").forEach(item => item.setAttribute("aria-current", String(item.dataset.section === active || (item.id === "posts-button" && active === "posts"))));
  if (active === "activity-registrations") {
    $("editor-title").textContent = "Δηλώσεις συμμετοχής σε δράσεις";
    $("editor-help").textContent = "Προσωπικά στοιχεία, ορατά μόνο στους διαχειριστές. Διαγράψτε τα όταν δεν είναι πλέον απαραίτητα για τη δράση.";
    if (activityRegistrationsEnabled) disposeMembers = mountActivityAdmin(root, { run, message, confirmAction, demo });
    else root.append(element("p", "Η ιδιωτική βάση δηλώσεων δεν έχει ενεργοποιηθεί ακόμη."));
  } else if (active === "lending") {
    $("editor-title").textContent = "Εγγραφές και δανεισμοί";
    $("editor-help").textContent = "Οι ενέργειες αποθηκεύονται αμέσως και ιδιωτικά. Τα email έγκρισης αποστέλλονται χειροκίνητα από εσάς.";
    disposeMembers = mountLendingAdmin(root, { run, message, confirmAction, demo });
  } else if (active === "members") {
    $("editor-title").textContent = "Μέλη — ιδιωτικό μητρώο";
    $("editor-help").textContent = "Προσωπικά στοιχεία, ορατά μόνο στους διαχειριστές. Χρησιμοποιήστε την «Αποθήκευση μέλους — ιδιωτικά», όχι τη «Δημοσίευση αλλαγών».";
    disposeMembers = mountMembersAdmin(root, { run, message, confirmAction, demo, setUnsaved: value => { memberDirty = value; updateState(); } });
  } else if (active === "books") {
    $("editor-title").textContent = "Βιβλία και έλεγχος καταλόγου";
    $("editor-help").textContent = "Αναζητήστε, διορθώστε ή προσθέστε βιβλία. Η αποθήκευση βιβλίου γίνεται με το δικό του κουμπί, όχι με τη «Δημοσίευση αλλαγών» στο κάτω μέρος.";
    disposeLibrary = mountLibraryAdmin(root, { run, message, confirmAction, demo, setUnsaved: value => { bookDirty = value; updateState(); } });
  } else if (active === "posts") {
    $("editor-title").textContent = "Αναρτήσεις και ανακοινώσεις";
    $("editor-help").textContent = "Προσθέστε νέα, εκδηλώσεις ή άρθρα και επιλέξτε σε ποια ενότητα θα εμφανιστούν.";
    renderPosts(root);
  } else {
    $("editor-title").textContent = active === "home" ? "Αρχική σελίδα και λογότυπο" : sections.find(([id]) => id === active)[1];
    $("editor-help").textContent = "Γράψτε στα παρακάτω πεδία. Τα κείμενά σας θα παραμείνουν εδώ όσο μετακινείστε ανάμεσα στις ενότητες. Δημοσιεύστε πριν κλείσετε τη σελίδα.";
    const fields = active === "home" ? homeFields : sectionFields(active);
    for (const [id, , label] of fields) {
      field(root, id, label, content.fields[id] ?? defaults[id], value => {
        if (value === defaults[id]) delete content.fields[id];
        else content.fields[id] = value;
      }, { multiline: defaults[id].includes("\n") || id.includes("body") || id.includes("description") || id.includes("note") || ["hero-title", "band-text", "notice"].includes(id) });
    }
    if (active === "home") {
      renderImage(root, "logo", "Λογότυπο πάνω αριστερά", logoUrl);
      renderImage(root, "hero", "Κεντρική εικόνα της αρχικής");
    } else renderImage(root, active, "Προαιρετική φωτογραφία στην αριστερή θέση της ενότητας");
  }
  if (focus) $("editor-title").focus();
  updateState();
}

function renderPosts(root) {
  root.append(button("＋ Νέα ανάρτηση", () => {
    if (content.posts.length >= 500) {
      message("Έχετε φτάσει τις 500 αναρτήσεις. Επικοινωνήστε με τον υπεύθυνο πριν προσθέσετε άλλες.", "error");
      return;
    }
    const date = new Date();
    const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const post = { id: crypto.randomUUID(), section: "nea", title: "", body: "", date: localDate, image: "", alt: "" };
    rememberChange(`post-add-${post.id}`);
    content.posts.unshift(post);
    changed();
    renderEditor(false);
    editPost(post, root);
  }, ""));
  if (!content.posts.length) root.append(element("p", "Δεν υπάρχουν ακόμη αναρτήσεις. Πατήστε «Νέα ανάρτηση» για να ξεκινήσετε.", "hint"));
  for (const post of content.posts) {
    const row = element("div", undefined, "post-summary");
    row.append(element("h3", post.title || "Νέα ανάρτηση — χωρίς τίτλο ακόμη"), element("p", `${sections.find(([id]) => id === post.section)[1]} · ${post.date}`, "hint"));
    const actions = element("div", undefined, "actions");
    actions.append(button("Επεξεργασία", () => editPost(post, root)), button("Διαγραφή", async () => {
      if (await confirmAction("Η ανάρτηση θα αφαιρεθεί όταν δημοσιεύσετε τις αλλαγές. Να συνεχίσουμε;", "Διαγραφή ανάρτησης;")) {
        rememberChange(`post-delete-${post.id}`);
        content.posts = content.posts.filter(item => item.id !== post.id);
        changed();
        renderEditor(false);
      }
    }, "danger"));
    row.append(actions);
    root.append(row);
  }
}

function editPost(post, root) {
  root.querySelector(".post-form")?.remove();
  const form = element("div", undefined, "post-form");
  form.dataset.postId = post.id;
  form.append(element("h3", "Επεξεργασία ανάρτησης"));
  const label = element("label", "Πού θα εμφανιστεί;");
  label.htmlFor = "post-section";
  const select = element("select");
  select.id = "post-section";
  for (const [id, title] of sections) {
    const option = element("option", title);
    option.value = id;
    select.append(option);
  }
  select.value = post.section;
  select.addEventListener("change", () => {
    rememberChange(`post-section-${post.id}-${crypto.randomUUID()}`);
    post.section = select.value;
    if (activitySections.has(post.section)) {
      post.summary ??= "";
      post.registration_open ??= false;
    } else {
      delete post.summary;
      delete post.registration_open;
    }
    changed();
    editPost(post, root);
  });
  form.append(label, select);
  field(form, "post-title", "Τίτλος ανάρτησης", post.title, value => { post.title = value; }, { maxLength: 300, required: true });
  field(form, "post-date", "Ημερομηνία", post.date, value => { post.date = value; }, { type: "date", required: true });
  if (activitySections.has(post.section)) {
    field(form, "post-summary", "Λίγα λόγια για την κάρτα της δράσης", post.summary ?? "", value => { post.summary = value; }, { multiline: true, maxLength: 500, required: true });
  }
  field(form, "post-body", activitySections.has(post.section) ? "Αναλυτικό κείμενο δράσης" : "Κείμενο ανάρτησης", post.body, value => { post.body = value; }, { multiline: true, maxLength: 50000, required: true });
  if (activitySections.has(post.section)) {
    const registrationLabel = element("label", undefined, "checkbox-field");
    const registration = element("input");
    registration.type = "checkbox";
    registration.checked = post.registration_open === true;
    registration.addEventListener("change", () => {
      rememberChange(`post-registration-${post.id}-${crypto.randomUUID()}`);
      post.registration_open = registration.checked;
      changed();
    });
    registrationLabel.append(registration, document.createTextNode(" Οι δηλώσεις συμμετοχής είναι ανοικτές"));
    form.append(registrationLabel, element("p", "Αν το αποεπιλέξετε, η δράση θα παραμένει δημοσιευμένη αλλά η φόρμα συμμετοχής δεν θα εμφανίζεται.", "hint"));
  }
  if (post.image) {
    const image = element("img", undefined, "post-image");
    image.src = post.image;
    image.alt = post.alt;
    image.style.maxWidth = "100%";
    image.style.maxHeight = "240px";
    form.append(image, button("Αφαίρεση φωτογραφίας", () => {
      rememberChange(`post-image-remove-${post.id}-${crypto.randomUUID()}`);
      post.image = "";
      post.alt = "";
      changed();
      editPost(post, root);
    }));
  }
  const upload = element("input");
  upload.type = "file";
  upload.accept = "image/jpeg,image/png,image/webp";
  upload.id = "post-image";
  upload.disabled = demo;
  const caption = element("label", "Φωτογραφία ανάρτησης (προαιρετική)");
  caption.htmlFor = upload.id;
  form.append(caption, upload, element("p", demo ? "Οι φωτογραφίες ενεργοποιούνται μετά τη σύνδεση με το Supabase." : "Έως 5 MB. Ανεβάζετε μόνο εικόνες κατάλληλες για δημόσια προβολή.", "hint"));
  upload.addEventListener("change", () => {
    if (!upload.files[0]) return;
    run(async () => {
      const url = await uploadImage(upload.files[0]);
      rememberChange(`post-image-upload-${post.id}-${crypto.randomUUID()}`);
      post.image = url;
      changed();
      editPost(post, root);
      message("Η φωτογραφία προστέθηκε στην ανάρτηση. Οι αλλαγές δεν έχουν δημοσιευτεί ακόμη.");
    });
  });
  field(form, "post-alt", "Περιγραφή φωτογραφίας (προαιρετική)", post.alt, value => { post.alt = value; }, { maxLength: 500 });
  form.append(button("Έτοιμο — επιστροφή στη λίστα", () => {
    renderEditor();
    message("Οι αλλαγές κρατήθηκαν στην οθόνη. Για να εμφανιστούν στην ιστοσελίδα, πατήστε «Δημοσίευση αλλαγών».");
  }));
  root.append(form);
  form.scrollIntoView({ behavior: "auto", block: "start" });
  form.querySelector("input").focus();
}

async function enterWorkspace(session) {
  const { data: allowed, error } = await client.rpc("is_site_admin");
  if (error) throw error;
  if (!allowed) throw new Error("Δεν έχετε πρόσβαση στη διαχείριση. Ζητήστε από τον υπεύθυνο να ενεργοποιήσει τον λογαριασμό σας.");
  if (userId === session.user.id && !demo) {
    showWorkspace();
    return;
  }
  const data = await loadContent();
  version = data.version;
  userId = session.user.id;
  dirty = false;
  undoHistory.clear();
  demo = false;
  await loadDefaults();
  content = normalizeContent(data.document, defaults);
  showWorkspace();
}

$("start-demo").addEventListener("click", () => run(async () => {
  demo = true;
  content = emptyContent();
  dirty = false;
  undoHistory.clear();
  await loadDefaults();
  showWorkspace();
}));
$("posts-button").addEventListener("click", () => selectEditor("posts"));
$("show-password").addEventListener("click", () => {
  const show = $("password").type === "password";
  $("password").type = show ? "text" : "password";
  $("show-password").textContent = show ? "Απόκρυψη" : "Εμφάνιση";
  $("show-password").setAttribute("aria-pressed", String(show));
});
$("login-form").addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    const { data, error } = await client.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    if (error) throw error;
    $("password").value = "";
    await enterWorkspace(data.session);
    message("Καλώς ήρθατε! Επιλέξτε την ενότητα που θέλετε να ενημερώσετε.");
  });
});
$("forgot-password").addEventListener("click", () => run(async () => {
  if (!$("email").value || !$("email").checkValidity()) throw new Error("Γράψτε πρώτα το email σας στο πεδίο «Το email σας».");
  const { error } = await client.auth.resetPasswordForEmail($("email").value.trim(), { redirectTo: new URL("./", location.href).href });
  if (error) throw error;
  message("Αν το email αντιστοιχεί σε λογαριασμό, θα λάβετε οδηγίες αλλαγής κωδικού. Ελέγξτε και την ανεπιθύμητη αλληλογραφία.");
}));
$("recovery-form").addEventListener("submit", event => {
  event.preventDefault();
  run(async () => {
    if ($("new-password").value !== $("confirm-password").value) throw new Error("Οι δύο κωδικοί δεν είναι ίδιοι.");
    const { error } = await client.auth.updateUser({ password: $("new-password").value });
    if (error) throw error;
    $("recovery-form").reset();
    recovery = false;
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!data.session) throw new Error("Συνδεθείτε ξανά με τον νέο κωδικό σας.");
    await enterWorkspace(data.session);
    message("Ο νέος κωδικός αποθηκεύτηκε.");
  });
});
$("logout").addEventListener("click", async () => {
  if ((dirty || bookDirty || memberDirty) && !await confirmAction("Υπάρχουν αλλαγές που δεν αποθηκεύτηκαν. Αν αποσυνδεθείτε θα χαθούν. Να συνεχίσουμε;", "Αποσύνδεση χωρίς αποθήκευση;")) return;
  run(async () => {
    if (!demo) {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    }
    dirty = false;
    undoHistory.clear();
    bookDirty = false;
    disposeMembers?.();
    disposeMembers = null;
    memberDirty = false;
    userId = null;
    sessionStorage.removeItem(`xenopouleio-preview-${previewId}`);
    location.reload();
  });
});
$("preview").addEventListener("click", () => {
  if (["members", "lending", "activity-registrations"].includes(active)) return;
  try {
    validateContent(content);
    sessionStorage.setItem(`xenopouleio-preview-${previewId}`, JSON.stringify(content));
    const previewSection = active === "books" ? "daneistiki" : active === "posts" ? $("post-section")?.value || content.posts[0]?.section || "nea" : active;
    const url = new URL(sections.some(([id]) => id === previewSection) ? `../${previewSection}.html` : "../", location.href);
    url.searchParams.set("preview", previewId);
    $("preview-frame").src = url.href;
    $("preview-dialog").showModal();
  } catch (error) {
    console.error("Preview failed", error);
    message(describeError(error), "error");
  }
});
$("close-preview").addEventListener("click", () => $("preview-dialog").close());
$("undo").addEventListener("click", () => {
  if (!contentEditors() || bookDirty || memberDirty || busy) return;
  const editingPostId = $("editor").querySelector(".post-form")?.dataset.postId;
  const previous = undoHistory.undo();
  if (!previous) return;
  content = previous.value;
  dirty = previous.dirty;
  renderEditor(false);
  const restoredPost = editingPostId && content.posts.find(post => post.id === editingPostId);
  if (restoredPost && active === "posts") editPost(restoredPost, $("editor"));
  message("Η τελευταία αλλαγή αναιρέθηκε. Μπορείτε να συνεχίσετε την επεξεργασία.");
});
$("publish").addEventListener("click", async () => {
  if (demo || !dirty || busy) return;
  if (!await confirmAction("Οι αλλαγές σας θα εμφανιστούν δημόσια στην ιστοσελίδα. Να τις δημοσιεύσουμε;", "Δημοσίευση αλλαγών;")) return;
  run(async () => {
    version = await publishContent(content, version);
    dirty = false;
    undoHistory.clear();
    message("Οι αλλαγές δημοσιεύτηκαν! Μπορείτε τώρα να ανοίξετε την ιστοσελίδα για να τις δείτε.");
  });
});
window.addEventListener("beforeunload", event => {
  if (dirty || bookDirty || memberDirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", () => {
  disposeMembers?.();
  disposeMembers = null;
});
window.addEventListener("pageshow", event => {
  if (event.persisted && ["members", "lending", "activity-registrations"].includes(active)) renderEditor();
});

if (!configured) {
  $("setup").hidden = false;
} else {
  $("login-panel").hidden = false;
  client.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      disposeMembers?.();
      disposeMembers = null;
      if (["members", "lending", "activity-registrations"].includes(active)) active = "home";
      recovery = true;
      $("login-panel").hidden = true;
      $("workspace").hidden = true;
      $("recovery-panel").hidden = false;
    } else if (event === "SIGNED_OUT") {
      disposeMembers?.();
      disposeMembers = null;
      if (["members", "lending", "activity-registrations"].includes(active)) active = "home";
      $("workspace").hidden = true;
      $("login-panel").hidden = false;
      message("Έγινε αποσύνδεση. Τα στοιχεία μελών αφαιρέθηκαν από την οθόνη. Τυχόν αδημοσίευτα κείμενα παραμένουν μόνο σε αυτή την καρτέλα.", "warning");
    }
  });
  run(async () => {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (recovery) {
      if (!data.session) throw new Error("Ο σύνδεσμος αλλαγής κωδικού έληξε ή δεν είναι έγκυρος. Ζητήστε νέο σύνδεσμο.");
      $("login-panel").hidden = true;
      $("recovery-panel").hidden = false;
    } else if (data.session) await enterWorkspace(data.session);
  });
}
