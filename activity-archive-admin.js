import { validateContent } from "./content.js";
import { node } from "./library.js";

const pageSize = 20;

function archiveText(html) {
  const document = new DOMParser().parseFromString(html, "text/html");
  return document.body.textContent.replace(/\s+/g, " ").trim();
}

function control(label, action, className = "secondary") {
  const button = node("button", label, className);
  button.type = "button";
  button.addEventListener("click", action);
  return button;
}

function field(form, labelText, value, options = {}) {
  const label = node("label", labelText);
  const input = options.multiline ? node("textarea") : node("input");
  input.value = value;
  if (options.type) input.type = options.type;
  if (options.maxLength) input.maxLength = options.maxLength;
  if (options.required) input.required = true;
  label.append(input);
  form.append(label);
  return input;
}

export function mountActivityArchiveAdmin(root, { content, changed, rememberChange, run, message, confirmAction, uploadImage, demo }) {
  let posts = [];
  let audience = "all";
  let term = "";
  let page = 1;
  let disposed = false;
  const body = node("div");
  root.append(node("p", "Οι αλλαγές και οι διαγραφές επηρεάζουν μόνο τη νέα ιστοσελίδα. Το αρχικό Blogspot παραμένει ανέπαφο."), body);

  const mergedPost = post => {
    const override = content.activity_archive_overrides[post.id];
    if (override?.hidden) return null;
    return override ? { ...post, ...override, edited: true } : post;
  };

  function saveOverride(id, override) {
    const next = structuredClone(content);
    next.activity_archive_overrides[id] = override;
    validateContent(next);
    rememberChange(`archive-${id}-${crypto.randomUUID()}`);
    content.activity_archive_overrides = next.activity_archive_overrides;
    changed();
  }

  function edit(post) {
    body.replaceChildren();
    const form = node("form", undefined, "archive-edit-form");
    const title = field(form, "Τίτλος", post.title, { maxLength: 300, required: true });
    const audienceLabel = node("label", "Κατηγορία");
    const audienceSelect = node("select");
    for (const [value, text] of [["children", "Δράσεις για παιδιά"], ["adults", "Δράσεις για εκπαιδευτικούς και ενήλικες"]]) {
      const option = node("option", text);
      option.value = value;
      audienceSelect.append(option);
    }
    audienceSelect.value = post.audience;
    audienceLabel.append(audienceSelect);
    form.append(audienceLabel);
    const date = field(form, "Ημερομηνία ανάρτησης", post.date, { type: "date", required: true });
    const eventDate = field(form, "Ημερομηνία διεξαγωγής (προαιρετική)", post.event_date ?? "", { type: "date" });
    const summary = field(form, "Λίγα λόγια για την κάρτα", post.summary, { multiline: true, maxLength: 500, required: true });
    const bodyText = field(form, "Αναλυτικό κείμενο", post.body ?? archiveText(post.content), { multiline: true, maxLength: 50000, required: true });
    const alt = field(form, "Περιγραφή φωτογραφίας (προαιρετική)", post.alt ?? "", { maxLength: 500 });
    let imageUrl = post.image;
    const image = node("img", undefined, "post-image");
    image.src = imageUrl;
    image.alt = alt.value;
    image.hidden = !imageUrl;
    const upload = node("input");
    upload.type = "file";
    upload.accept = "image/jpeg,image/png,image/webp";
    upload.disabled = demo;
    upload.addEventListener("change", () => {
      if (!upload.files[0]) return;
      run(async () => {
        imageUrl = await uploadImage(upload.files[0]);
        image.src = imageUrl;
        image.hidden = false;
        message("Η νέα φωτογραφία επιλέχθηκε. Πατήστε «Αποθήκευση αλλαγών» και μετά «Δημοσίευση αλλαγών».");
      });
    });
    form.append(node("label", "Νέα φωτογραφία (προαιρετική)"), upload, image);
    const actions = node("div", undefined, "actions");
    const save = node("button", "Αποθήκευση αλλαγών");
    save.type = "submit";
    actions.append(save, control("Επιστροφή στο αρχείο", render));
    form.append(actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const override = {
        hidden: false,
        title: title.value.trim(),
        audience: audienceSelect.value,
        date: date.value,
        summary: summary.value.trim(),
        body: bodyText.value.trim(),
        image: imageUrl,
        alt: alt.value.trim(),
      };
      if (eventDate.value) override.event_date = eventDate.value;
      saveOverride(post.id, override);
      render();
      message("Οι αλλαγές κρατήθηκαν. Πατήστε «Δημοσίευση αλλαγών» για να εμφανιστούν στην ιστοσελίδα.");
    });
    body.append(form);
    title.focus();
  }

  function render() {
    if (disposed) return;
    body.replaceChildren();
    const search = node("form", undefined, "archive-search");
    const queryLabel = node("label", "Αναζήτηση τίτλου");
    const query = node("input");
    query.type = "search";
    query.maxLength = 300;
    query.value = term;
    queryLabel.append(query);
    const audienceLabel = node("label", "Κατηγορία");
    const select = node("select");
    for (const [value, text] of [["all", "Όλες"], ["children", "Για παιδιά"], ["adults", "Για εκπαιδευτικούς και ενήλικες"]]) {
      const option = node("option", text);
      option.value = value;
      select.append(option);
    }
    select.value = audience;
    audienceLabel.append(select);
    const submit = node("button", "Αναζήτηση");
    search.append(queryLabel, audienceLabel, submit);
    search.addEventListener("submit", event => {
      event.preventDefault();
      term = query.value.trim();
      audience = select.value;
      page = 1;
      render();
    });
    select.addEventListener("change", () => {
      audience = select.value;
      term = query.value.trim();
      page = 1;
      render();
    });
    const normalizedTerm = term.toLocaleLowerCase("el-GR");
    const filtered = posts.map(mergedPost).filter(post => post
      && (audience === "all" || post.audience === audience)
      && (!normalizedTerm || post.title.toLocaleLowerCase("el-GR").includes(normalizedTerm)))
      .sort((a, b) => (b.event_date ?? b.date).localeCompare(a.event_date ?? a.date));
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > pages) page = pages;
    body.append(search, node("p", `${filtered.length.toLocaleString("el-GR")} αναρτήσεις · Σελίδα ${page} από ${pages}`, "hint"));
    for (const post of filtered.slice((page - 1) * pageSize, page * pageSize)) {
      const card = node("article", undefined, "post-summary");
      card.append(
        node("h3", post.title),
        node("p", `${post.audience === "children" ? "Για παιδιά" : "Για εκπαιδευτικούς και ενήλικες"} · ${post.event_date ?? post.date}${post.edited ? " · Επεξεργασμένη" : ""}`, "hint"),
      );
      const actions = node("div", undefined, "actions");
      actions.append(
        control("Επεξεργασία", () => edit(post)),
        control("Διαγραφή από την ιστοσελίδα", () => run(async () => {
          if (!await confirmAction(`Η ανάρτηση «${post.title}» θα κρυφτεί από τη νέα ιστοσελίδα. Το Blogspot δεν θα αλλάξει. Να συνεχίσουμε;`, "Διαγραφή αρχειακής δράσης;")) return;
          saveOverride(post.id, { hidden: true });
          render();
          message("Η ανάρτηση θα αφαιρεθεί από την ιστοσελίδα όταν πατήσετε «Δημοσίευση αλλαγών».");
        }), "danger"),
      );
      card.append(actions);
      body.append(card);
    }
    if (!filtered.length) body.append(node("p", "Δεν βρέθηκαν αναρτήσεις."));
    const pagination = node("div", undefined, "actions");
    const previous = control("← Προηγούμενη σελίδα", () => { page--; render(); });
    const next = control("Επόμενη σελίδα →", () => { page++; render(); });
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
    pagination.append(previous, next);
    body.append(pagination);
  }

  run(async () => {
    const archives = await Promise.all(["children", "adults"].map(async audienceName => {
      const response = await fetch(new URL(`../activity-archive-${audienceName}.json`, location.href));
      if (!response.ok) throw new Error(`Δεν φορτώθηκε το αρχείο δράσεων (${response.status}).`);
      const archive = await response.json();
      if (!Array.isArray(archive.posts)) throw new Error("Το αρχείο δράσεων δεν είναι έγκυρο.");
      return archive.posts.map(post => ({ ...post, audience: audienceName }));
    }));
    posts = archives.flat();
    render();
  });

  return () => {
    disposed = true;
    root.replaceChildren();
  };
}
