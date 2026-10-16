import { client } from "./cms.js";
import { memberFields, memberValues, memberError, needsMemberReview } from "./members-data.js";
import { node } from "./library.js";

export function mountMembersAdmin(root, { run, message, confirmAction, setUnsaved, demo }) {
  root.classList.add("library-catalog");
  root.append(node("p", "ΙΔΙΩΤΙΚΟ ΜΗΤΡΩΟ — Μόνο για διαχειριστές. Τα στοιχεία δεν δημοσιεύονται στην ιστοσελίδα. Οι κωδικοί μελών είναι αριθμοί μητρώου, όχι κωδικοί πρόσβασης."),
    node("p", "Κρατήθηκαν οι αρχικές στήλες του Excel, χωρίς αυτόματο διαχωρισμό ονομάτων. Ελλιπή επώνυμα ή αριθμοί στη στήλη ονόματος σημειώνονται για έλεγχο. Μην συμπληρώνετε στοιχεία χωρίς επιβεβαίωση."));
  if (demo) {
    root.append(node("p", "Τα προσωπικά στοιχεία δεν εμφανίζονται στη δοκιμαστική περιήγηση. Συνδεθείτε ως διαχειριστής."));
    return () => root.replaceChildren();
  }
  const controls = node("div", undefined, "actions");
  const body = node("div");
  root.append(controls, body);
  let page = 1;
  let term = "";
  let reviewOnly = false;
  let disposed = false;
  let request = 0;
  let changed = false;
  let draft = null;
  let editing = false;
  function markChanged(value) { changed = value; setUnsaved(value); }
  const act = (label, action, className = "secondary") => {
    const control = node("button", label, className);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  };
  const execute = action => run(async () => {
    try {
      await action();
    } catch (error) {
      reportError(error);
    }
  });
  function reportError(error) {
    if (disposed) return;
    if (error.code === "42501" || error.status === 401 || error.status === 403) {
      ++request;
      draft = null;
      editing = false;
      markChanged(false);
      body.replaceChildren();
    }
    message(memberError(error), "error");
  }
  async function leaveForm() {
    if (changed && !await confirmAction("Οι αλλαγές του μέλους δεν αποθηκεύτηκαν. Να επιστρέψουμε χωρίς αποθήκευση;", "Μη αποθηκευμένο μέλος")) return false;
    markChanged(false);
    editing = false;
    draft = null;
    return true;
  }
  controls.append(
    act("＋ Νέο μέλος", () => execute(async () => { if (await leaveForm()) edit({}); }), ""),
    act("Ανανέωση λίστας", () => execute(async () => { if (await leaveForm()) await load(1); })),
  );
  async function load(targetPage = page) {
    const currentRequest = ++request;
    const { data, error } = await client.rpc("members_search", {
      search_term: term, page_number: targetPage, review_only: reviewOnly,
    });
    if (error) throw error;
    if (disposed || editing || currentRequest !== request) return;
    page = targetPage;
    body.replaceChildren();
    const form = node("form", undefined, "library-search");
    const label = node("label", "Αναζήτηση με κωδικό ή όνομα μέλους");
    const input = node("input");
    input.id = "members-query";
    input.type = "search";
    input.maxLength = 200;
    input.value = term;
    input.autocomplete = "off";
    label.htmlFor = input.id;
    const filterLabel = node("label", "Ποιες εγγραφές θέλετε να δείτε;");
    const filter = node("select");
    filter.id = "members-filter";
    filterLabel.htmlFor = filter.id;
    for (const [value, text] of [["all", "Όλα τα μέλη"], ["review", "Χρειάζονται έλεγχο"]]) {
      const option = node("option", text);
      option.value = value;
      filter.append(option);
    }
    filter.value = reviewOnly ? "review" : "all";
    form.append(label, input, filterLabel, filter, node("button", "Αναζήτηση μελών"));
    form.addEventListener("submit", event => {
      event.preventDefault();
      execute(async () => {
        term = input.value.trim();
        reviewOnly = filter.value === "review";
        await load(1);
      });
    });
    const count = node("p", `${data.total.toLocaleString("el-GR")} ${data.total === 1 ? "εγγραφή" : "εγγραφές"} · Σελίδα ${page} από ${Math.max(1, Math.ceil(data.total / 20))}. Χρειάζονται έλεγχο συνολικά: ${data.review_total}.`);
    count.setAttribute("role", "status");
    body.append(form, count);
    if (!data.items.length) body.append(node("p", "Δεν βρέθηκαν μέλη."));
    for (const record of data.items) {
      const card = node("article", undefined, "library-book");
      card.append(node("h3", `Μέλος ${record.member_code}`));
      const fields = node("dl");
      for (const [key, label] of memberFields.slice(1)) fields.append(node("dt", label), node("dd", record[key] || "Δεν αναφέρεται"));
      card.append(fields);
      if (record.needs_review) card.append(node("p", "Χρειάζεται έλεγχος των αρχικών στοιχείων.", "library-review-source"));
      const actions = node("div", undefined, "actions");
      actions.append(act("Επεξεργασία μέλους", () => edit(record)), act("Διαγραφή μέλους", () => execute(async () => {
        if (!await confirmAction("Η εγγραφή θα διαγραφεί οριστικά από το ιδιωτικό μητρώο. Η ενέργεια δεν αναιρείται. Να συνεχίσουμε;", "Οριστική διαγραφή μέλους;")) return;
        const { error } = await client.rpc("members_delete", { member_id: record.id, expected_version: record.version });
        if (error) throw error;
        await load(1);
        message("Το μέλος διαγράφηκε από το ιδιωτικό μητρώο.");
      }), "danger"));
      card.append(actions);
      body.append(card);
    }
    const pagination = node("div", undefined, "library-pagination");
    const previous = act("Προηγούμενη σελίδα", () => execute(() => load(page - 1)));
    const next = act("Επόμενη σελίδα", () => execute(() => load(page + 1)));
    previous.disabled = page <= 1;
    next.disabled = page * 20 >= data.total;
    pagination.append(previous, next);
    body.append(pagination);
  }

  function edit(record) {
    editing = true;
    ++request;
    draft = Object.fromEntries(memberFields.map(([key]) => [key, record[key] || ""]));
    const form = node("form", undefined, "library-form");
    form.autocomplete = "off";
    form.append(node("h3", record.id ? "Επεξεργασία ιδιωτικής εγγραφής" : "Νέο μέλος"),
      node("p", "Η αποθήκευση αφορά μόνο το ιδιωτικό μητρώο. Δεν εμφανίζεται ποτέ στη δημόσια ιστοσελίδα."));
    for (const [key, label, limit] of memberFields) {
      const caption = node("label", `${label}${key === "member_code" ? " (υποχρεωτικό)" : ""}`);
      const input = node("input");
      input.id = `member-${key}`;
      input.value = draft[key];
      input.maxLength = limit;
      input.autocomplete = "off";
      if (key === "member_code") {
        input.required = true;
        input.inputMode = "numeric";
        input.pattern = "[0-9]{1,20}";
      }
      caption.htmlFor = input.id;
      input.addEventListener("input", () => { draft[key] = input.value; markChanged(true); });
      form.append(caption, input);
    }
    const actions = node("div", undefined, "actions");
    actions.append(node("button", "Αποθήκευση μέλους — ιδιωτικά"), act("Ακύρωση / επιστροφή", () => execute(async () => { if (await leaveForm()) await load(); })));
    form.append(actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      execute(async () => {
        let values;
        try { values = memberValues(draft); } catch (error) { message(error.message, "error"); return; }
        const warning = needsMemberReview(values) ? " Υπάρχουν ελλιπή ή ασυνήθιστα στοιχεία· η εγγραφή θα σημειωθεί για έλεγχο." : "";
        if (!await confirmAction(`Να αποθηκευτούν οι αλλαγές στο ιδιωτικό μητρώο μελών;${warning}`, "Ιδιωτική αποθήκευση μέλους;")) return;
        const { error } = await client.rpc("members_save", {
          member_data: values, member_id: record.id || null, expected_version: record.version || null,
        });
        if (error) throw error;
        markChanged(false);
        draft = null;
        editing = false;
        await load(1);
        message("Το μέλος αποθηκεύτηκε ιδιωτικά. Δεν δημοσιεύτηκαν προσωπικά στοιχεία.");
      });
    });
    body.replaceChildren(form);
    form.querySelector("input").focus();
  }

  load().catch(reportError);
  return () => {
    disposed = true;
    ++request;
    draft = null;
    markChanged(false);
    root.replaceChildren();
  };
}
