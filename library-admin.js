import { client } from "./cms.js";
import { bookFields, bookStatuses, bookValues, fieldLimits, node, bookCard, searchBooks } from "./library.js";

export function mountLibraryAdmin(root, { run, message, confirmAction, setUnsaved, demo }) {
  root.classList.add("library-catalog");
  if (demo) {
    root.append(node("p", "Η διαχείριση βιβλίων λειτουργεί μόνο μετά τη σύνδεση. Δεν γίνονται αλλαγές στη δοκιμαστική περιήγηση."));
    return () => {};
  }
  const tabs = node("div", undefined, "actions");
  const body = node("div");
  let mode = "books";
  let page = 1;
  let term = "";
  let filter = "pending";
  let request = 0;
  let disposed = false;
  let editing = false;
  let changed = false;
  let formData = null;
  const setChanged = value => { changed = value; setUnsaved(value); };
  const act = (label, action, className = "secondary") => {
    const control = node("button", label, className);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  };
  async function leaveForm() {
    if (changed && !await confirmAction("Οι αλλαγές αυτού του βιβλίου δεν αποθηκεύτηκαν. Να τις αφήσουμε;", "Επιστροφή χωρίς αποθήκευση;")) return false;
    setChanged(false);
    editing = false;
    formData = null;
    return true;
  }
  async function switchMode(value) {
    if (!await leaveForm()) return;
    mode = value;
    page = 1;
    term = "";
    await load();
  }
  tabs.append(
    act("Δημόσιος κατάλογος", () => run(() => switchMode("books"))),
    act("Βοηθητικά φύλλα — ιδιωτικός έλεγχος", () => run(() => switchMode("review"))),
    act("＋ Νέο βιβλίο", () => run(async () => { if (await leaveForm()) editBook({}); }), ""),
  );
  root.append(node("p", "Τα βιβλία αποθηκεύονται ξεχωριστά από τα κείμενα της ιστοσελίδας. Η «Αποθήκευση βιβλίου» ενημερώνει αμέσως τον δημόσιο κατάλογο. Τα βοηθητικά φύλλα είναι ιδιωτικά."), tabs, body);

  async function load() {
    const currentRequest = ++request;
    const data = mode === "books" ? await searchBooks(term, page) : await loadReview();
    if (disposed || currentRequest !== request || editing) return;
    body.replaceChildren();
    const search = node("form", undefined, "library-search");
    const label = node("label", mode === "books" ? "Αναζήτηση βιβλίων" : "Αναζήτηση τίτλου στα βοηθητικά φύλλα");
    const input = node("input");
    input.id = "admin-library-query";
    input.maxLength = 200;
    input.type = "search";
    input.value = term;
    label.htmlFor = input.id;
    const submit = node("button", "Αναζήτηση");
    search.append(label, input, submit);
    if (mode === "review") {
      const caption = node("label", "Ποιες εγγραφές θέλετε να δείτε;");
      const select = node("select");
      select.id = "review-filter";
      caption.htmlFor = select.id;
      for (const [value, text] of [["pending", "Χρειάζονται έλεγχο"], ["all", "Όλες οι βοηθητικές εγγραφές"]]) {
        const option = node("option", text);
        option.value = value;
        select.append(option);
      }
      select.value = filter;
      select.addEventListener("change", () => run(async () => { filter = select.value; term = input.value.trim(); page = 1; await load(); }));
      search.append(caption, select);
      body.append(node("p", "Οι τίτλοι που βρέθηκαν ήδη στον κύριο κατάλογο μένουν ως αρχειακές αναφορές, όχι ως επιπλέον αντίτυπα. Οι παλιοί συγγραφείς μπορεί να είναι λανθασμένοι, ιδιαίτερα στο «Φύλλο4». Μην εγκρίνετε χωρίς έλεγχο."));
    }
    search.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => { term = input.value.trim(); page = 1; await load(); });
    });
    const count = node("p", `${data.total.toLocaleString("el-GR")} ${data.total === 1 ? "εγγραφή" : "εγγραφές"} · Σελίδα ${page} από ${Math.max(1, Math.ceil(data.total / 20))}`);
    count.setAttribute("role", "status");
    body.append(search, count);
    for (const record of data.items) {
      const card = bookCard({ ...record, status: record.status || "unverified" });
      const actions = node("div", undefined, "actions");
      if (mode === "books") {
        actions.append(act("Επεξεργασία βιβλίου", () => editBook(record)), act("Διαγραφή βιβλίου", () => run(async () => {
          if (!await confirmAction(`Το «${record.title}» θα αφαιρεθεί αμέσως από τον δημόσιο κατάλογο. Να συνεχίσουμε;`, "Οριστική διαγραφή βιβλίου;")) return;
          const { error } = await client.rpc("library_delete", { book_id: record.id, expected_version: record.version });
          if (error) throw error;
          await load();
          message("Το βιβλίο διαγράφηκε.");
        }), "danger"));
      } else {
        card.prepend(node("p", `${record.source_sheet} · Γραμμή ${record.source_row} · ${decisionLabel(record.decision)}`, "library-review-source"));
        if (record.decision === "pending") {
          actions.append(
            act("Έλεγχος και σύγκριση", () => review(record)),
            act("Δεν θα προστεθεί", () => resolve(record, "dismissed"), "danger"),
          );
        }
      }
      card.append(actions);
      body.append(card);
    }
    if (!data.total) body.append(node("p", "Δεν βρέθηκαν εγγραφές."));
    const pagination = node("div", undefined, "library-pagination");
    const previous = act("Προηγούμενη σελίδα", () => run(async () => { page--; await load(); }));
    const next = act("Επόμενη σελίδα", () => run(async () => { page++; await load(); }));
    previous.disabled = page <= 1;
    next.disabled = page * 20 >= data.total;
    pagination.append(previous, next);
    body.append(pagination);
  }

  async function loadReview() {
    let query = client.from("library_review").select("*", { count: "exact" });
    if (filter !== "all") query = query.eq("decision", filter);
    if (term) query = query.ilike("title", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, count, error } = await query.order("source_sheet").order("source_row").range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    return { items: data, total: count };
  }

  function resolve(record, resolution, book) {
    return run(async () => {
      const text = resolution === "linked" ? `Η βοηθητική εγγραφή είναι το ίδιο βιβλίο με το «${book.title}»; Δεν θα δημιουργηθεί δεύτερη εγγραφή και δεν θα αλλάξουν τα στοιχεία του υπάρχοντος βιβλίου.` : "Η εγγραφή θα μείνει στο ιδιωτικό αρχείο ως «Δεν θα προστεθεί». Δεν θα διαγραφεί.";
      if (!await confirmAction(text, "Ολοκλήρωση ελέγχου;")) return;
      const { error } = await client.rpc("library_resolve", {
        review_id: record.id, expected_version: record.version, resolution, target_book: book?.id ?? null,
      });
      if (error) throw error;
      editing = false;
      await load();
      message("Ο έλεγχος αποθηκεύτηκε. Η βοηθητική εγγραφή παραμένει ιδιωτική.");
    });
  }

  function review(record) {
    editing = true;
    ++request;
    body.replaceChildren(node("h3", record.title),
      node("p", `Πηγή: ${record.source_sheet}, γραμμή ${record.source_row}. Συγγραφέας στο παλιό φύλλο: ${record.author || "δεν αναφέρεται"}. Ταξινομικός αριθμός: ${record.classification_code || "δεν αναφέρεται"}.`),
      node("p", "Αναζητήστε πρώτα στον δημόσιο κατάλογο. Ελέγξτε τον τίτλο, τον συγγραφέα και τους αριθμούς. Μην αντιγράφετε αυτόματα παλιές ενδείξεις διαθεσιμότητας."));
    const form = node("form", undefined, "library-search");
    const label = node("label", "Βρείτε το ίδιο βιβλίο στον κύριο κατάλογο");
    const input = node("input");
    input.id = "compare-query";
    input.maxLength = 200;
    input.value = record.title.slice(0, 200);
    label.htmlFor = input.id;
    form.append(label, input, node("button", "Αναζήτηση για σύγκριση"));
    const matches = node("div");
    const search = () => run(async () => {
      const data = await searchBooks(input.value, 1);
      matches.replaceChildren(node("p", `${data.total} αποτελέσματα. Εμφανίζονται έως 20· περιορίστε την αναζήτηση αν χρειάζεται.`));
      for (const book of data.items) {
        const card = bookCard(book);
        card.append(act("Είναι το ίδιο βιβλίο — χωρίς νέα εγγραφή", () => resolve(record, "linked", book)));
        matches.append(card);
      }
    });
    form.addEventListener("submit", event => { event.preventDefault(); search(); });
    body.append(form, matches,
      act("Είναι διαφορετικό βιβλίο — έλεγχος στοιχείων πριν την προσθήκη", () => editBook(record, record)),
      act("Επιστροφή στη λίστα", () => run(async () => { editing = false; await load(); })),
    );
    search();
  }

  function editBook(record, source = null) {
    editing = true;
    ++request;
    formData = { ...record, status: record.status || "unverified" };
    const form = node("form", undefined, "library-form");
    form.append(node("h3", source ? "Έλεγχος βοηθητικής εγγραφής πριν τη δημοσίευση" : record.id ? "Επεξεργασία βιβλίου" : "Νέο βιβλίο"));
    if (source) form.append(node("p", "Επιβεβαιώστε τα στοιχεία από το πραγματικό βιβλίο. Η προσθήκη θα εμφανιστεί δημόσια. Μην αντιγράφετε λανθασμένους συγγραφείς ή βιβλία που έχουν αποσυρθεί."));
    bookFields.forEach(([key, label], index) => {
      const caption = node("label", `${label}${key === "title" ? " (υποχρεωτικό)" : ""}`);
      const input = node("input");
      input.id = `book-${key}`;
      caption.htmlFor = input.id;
      input.value = formData[key] || "";
      input.maxLength = fieldLimits[index];
      input.required = key === "title";
      input.addEventListener("input", () => { formData[key] = input.value; setChanged(true); });
      form.append(caption, input);
    });
    const statusLabel = node("label", "Κατάσταση");
    const status = node("select");
    status.id = "book-status";
    statusLabel.htmlFor = status.id;
    for (const [value, label] of Object.entries(bookStatuses)) {
      if (value === "borrowed" && record.status !== "borrowed") continue;
      const option = node("option", label);
      option.value = value;
      status.append(option);
    }
    if (record.status === "borrowed") status.disabled = true;
    status.value = formData.status;
    status.addEventListener("change", () => { formData.status = status.value; setChanged(true); });
    const actions = node("div", undefined, "actions");
    const save = node("button", "Αποθήκευση βιβλίου — δημόσια");
    actions.append(save, act("Ακύρωση / επιστροφή", () => run(async () => { if (await leaveForm()) await load(); })));
    form.append(statusLabel, status, actions);
    form.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => {
        const values = bookValues(formData);
        if (!await confirmAction(`Να αποθηκευτεί το «${values.title}» στον δημόσιο κατάλογο;`, "Αποθήκευση βιβλίου;")) return;
        const { error } = await client.rpc("library_save", {
          book_data: values, book_id: source ? null : record.id ?? null,
          expected_version: source ? null : record.version ?? null, review_id: source?.id ?? null,
        });
        if (error) throw error;
        setChanged(false);
        editing = false;
        formData = null;
        await load();
        message("Το βιβλίο αποθηκεύτηκε και εμφανίζεται στον δημόσιο κατάλογο.");
      });
    });
    body.replaceChildren(form);
    form.querySelector("input").focus();
  }

  const retry = act("Ανανέωση λίστας", () => run(async () => {
    if (await leaveForm()) await load();
  }));
  tabs.append(retry);
  load().catch(error => {
    if (disposed) return;
    console.error("Library administration loading failed", error);
    message(`Δεν φορτώθηκε ο κατάλογος. Πατήστε «Ανανέωση λίστας». ${error.message}`, "error");
  });
  return () => { disposed = true; ++request; setUnsaved(false); };
}

function decisionLabel(decision) {
  return {
    pending: "Χρειάζεται έλεγχο", reference: "Ο τίτλος υπάρχει ήδη — αρχειακή αναφορά",
    linked: "Συνδέθηκε με υπάρχον βιβλίο", added: "Προστέθηκε μετά από έλεγχο", dismissed: "Δεν θα προστεθεί",
  }[decision];
}
