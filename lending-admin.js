import { client } from "./cms.js";
import { node, searchBooks, bookCard } from "./library.js";
import { applicationFields, approvalEmail, lendingError } from "./lending-data.js";

export function mountLendingAdmin(root, { run, message, confirmAction, demo }) {
  root.classList.add("library-catalog");
  root.append(node("p", "ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ — Αιτήσεις, λογαριασμοί, δανεισμοί και επιστροφές. Τα προσωπικά στοιχεία και οι δανεισμοί δεν δημοσιεύονται."));
  if (demo) {
    root.append(node("p", "Συνδεθείτε ως διαχειριστής για πρόσβαση."));
    return () => root.replaceChildren();
  }
  const tabs = node("div", undefined, "actions");
  const body = node("div");
  root.append(tabs, body);
  let mode = "applications";
  let page = 1;
  let disposed = false;
  let generation = 0;
  let term = "";
  const act = (text, action) => {
    const button = node("button", text, "secondary");
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  };
  const execute = action => run(async () => {
    try { await action(); }
    catch (error) {
      if (disposed) return;
      if (error.code === "42501" || error.status === 401 || error.status === 403) {
        ++generation;
        body.replaceChildren();
      }
      message(lendingError(error), "error");
    }
  });
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  for (const [key, label] of [["applications", "Αιτήσεις εγγραφής / Email"], ["requests", "Αιτήματα δανεισμού"], ["loans", "Δανεισμένα / Επιστροφές"], ["checkout", "Νέος δανεισμός στο γραφείο"]]) {
    tabs.append(act(label, () => execute(async () => { mode = key; page = 1; await load(); })));
  }
  async function invitation(application, card) {
    const current = generation;
    const { data, error } = await client.functions.invoke("member-invitation", { body: { application_id: application.id } });
    if (error) throw error;
    if (disposed || current !== generation) return;
    card.querySelector(".invitation-draft")?.remove();
    const panel = node("div", undefined, "invitation-draft");
    const label = node("label", "Προσωπικό email έγκρισης — στείλτε το μόνο στον παρακάτω παραλήπτη");
    const text = node("textarea");
    text.id = `invitation-${application.id}`;
    label.htmlFor = text.id;
    text.value = approvalEmail(data);
    text.readOnly = true;
    text.rows = 12;
    text.style.width = "100%";
    const email = node("a", "Άνοιγμα στο πρόγραμμα email");
    email.href = `mailto:${encodeURIComponent(data.email)}?subject=${encodeURIComponent("Ξενοπούλειο — Έγκριση εγγραφής μέλους")}&body=${encodeURIComponent(text.value)}`;
    panel.append(node("p", `Παραλήπτης: ${data.email}. Δεν έχει αποσταλεί αυτόματα email. Ο σύνδεσμος είναι μίας χρήσης και λήγει· ετοιμάστε νέο αν χρειαστεί. Νέος σύνδεσμος μπορεί να ακυρώσει τον προηγούμενο.`),
      label, text, act("Αντιγραφή κειμένου email", () => execute(async () => {
        await navigator.clipboard.writeText(text.value);
        message("Το κείμενο αντιγράφηκε. Στείλτε το μόνο στο εγκεκριμένο email του μέλους.");
      })), email);
    card.append(panel);
    message("Το προσωπικό email είναι έτοιμο. Πρέπει να το στείλετε εσείς — δεν στάλθηκε αυτόματα.");
  }
  async function load() {
    const current = ++generation;
    const data = mode === "applications" ? await rpc("membership_applications", { page_number: page })
      : mode === "checkout" ? await searchBooks(term, page) : await rpc("lending_list", { list_kind: mode, page_number: page });
    if (disposed || current !== generation) return;
    body.replaceChildren(node("h3", { applications: "Αιτήσεις εγγραφής και ενεργοποίηση λογαριασμών", requests: "Αιτήματα — επιβεβαίωση κατά την παράδοση", loans: "Ενεργοί δανεισμοί — καταχώριση επιστροφής", checkout: "Επιλογή βιβλίου για παράδοση" }[mode]));
    body.append(act("Ανανέωση", () => execute(load)));
    if (mode === "checkout") {
      const form = node("form", undefined, "library-search");
      const label = node("label", "Αναζήτηση βιβλίου για δανεισμό");
      const input = node("input");
      input.id = "checkout-query";
      input.type = "search";
      input.maxLength = 200;
      input.value = term;
      label.htmlFor = input.id;
      form.append(label, input, node("button", "Αναζήτηση βιβλίου"));
      form.addEventListener("submit", event => {
        event.preventDefault();
        execute(async () => { term = input.value.trim(); page = 1; await load(); });
      });
      body.append(form, node("p", "Πρώτα επιβεβαιώστε ότι το συγκεκριμένο αντίτυπο είναι στο ράφι. Για βιβλία χωρίς επιβεβαιωμένη διαθεσιμότητα, ενημερώστε την κατάσταση από «Βιβλία και έλεγχος καταλόγου»."));
    }
    body.append(node("p", `${data.total.toLocaleString("el-GR")} εγγραφές · Σελίδα ${page} από ${Math.max(1, Math.ceil(data.total / 20))}`));
    for (const record of data.items) {
      const card = node("article", undefined, "library-book");
      if (mode === "applications") {
        card.append(node("h4", record.full_name), node("p", record.member_id ? `Εγκρίθηκε · Μητρώο ${record.member_code}` : "Περιμένει έγκριση"));
        const details = node("details");
        details.append(node("summary", "Προσωπικά στοιχεία αίτησης"));
        const fields = node("dl");
        for (const [key, label] of applicationFields) fields.append(node("dt", label), node("dd", record[key] || "—"));
        fields.append(node("dt", "Ανήλικο μέλος"), node("dd", record.is_minor ? "Ναι" : "Όχι"));
        details.append(fields);
        card.append(details);
        if (!record.member_id) {
          const form = node("form", undefined, "library-form");
          const label = node("label", "Αριθμός παλιού μέλους (μόνο αν επιβεβαιώσατε την ταυτότητα). Κενό: νέο μέλος με νέο αριθμό.");
          const code = node("input");
          code.id = `existing-${record.id}`;
          code.inputMode = "numeric";
          code.maxLength = 20;
          code.pattern = "[0-9]{1,20}";
          label.htmlFor = code.id;
          form.append(label, code, node("button", "Έγκριση εγγραφής"));
          form.addEventListener("submit", event => {
            event.preventDefault();
            execute(async () => {
              if (!await confirmAction(code.value.trim() ? "Επιβεβαιώσατε ότι το email ανήκει στο συγκεκριμένο παλιό μέλος; Η σύνδεση δίνει πρόσβαση στους δανεισμούς του." : "Ελέγξατε τα στοιχεία; Θα δημιουργηθεί νέο μέλος με νέο αριθμό μητρώου.", "Έγκριση αίτησης;")) return;
              await rpc("membership_decide", { application_id: record.id, decision: "approve", existing_code: code.value.trim() });
              await load();
              message("Η αίτηση εγκρίθηκε. Πατήστε «Ετοιμασία προσωπικού email» και στείλτε το στο μέλος.");
            });
          });
          card.append(form, act("Απόρριψη και διαγραφή αίτησης", () => execute(async () => {
            if (!await confirmAction("Η μη εγκεκριμένη αίτηση και τα προσωπικά της στοιχεία θα διαγραφούν. Να συνεχίσουμε;")) return;
            await rpc("membership_decide", { application_id: record.id, decision: "reject" });
            await load();
            message("Η αίτηση διαγράφηκε.");
          })));
        } else card.append(act("Ετοιμασία προσωπικού email / Νέος σύνδεσμος", () => execute(async () => {
          if (!await confirmAction("Θα δημιουργηθεί προσωπικός σύνδεσμος ενεργοποίησης ή ορισμού νέου κωδικού. Στείλτε τον μόνο στο εγκεκριμένο email του μέλους.", "Ετοιμασία email;")) return;
          await invitation(record, card);
        })));
      } else if (mode === "checkout") {
        card.append(bookCard(record));
        if (record.status === "available") {
          const form = node("form", undefined, "library-form");
          const label = node("label", "Αριθμός μητρώου μέλους");
          const code = node("input");
          code.id = `checkout-${record.id}`;
          code.maxLength = 20;
          code.inputMode = "numeric";
          code.pattern = "[0-9]{1,20}";
          code.required = true;
          label.htmlFor = code.id;
          form.append(label, code, node("button", "Καταχώριση παράδοσης βιβλίου"));
          form.addEventListener("submit", event => {
            event.preventDefault();
            execute(async () => {
              if (!await confirmAction(`Παραδίδετε το «${record.title}» στο μέλος ${code.value.trim()}; Ελέγξτε το μητρώο πριν επιβεβαιώσετε. Το βιβλίο θα γίνει «Δανεισμένο».`)) return;
              await rpc("lending_checkout", { book_id: record.id, member_code: code.value.trim() });
              await load();
              message("Ο δανεισμός καταχωρίστηκε.");
            });
          });
          card.append(form);
        }
      } else {
        card.append(node("h4", record.title), node("p", `Ταξινομικός αριθμός: ${record.classification_code || "—"}`),
          node("p", `Μέλος ${record.member_code} · ${record.surname} ${record.given_name}`),
          node("p", new Date(record.date).toLocaleString("el-GR")));
        if (mode === "requests") {
          card.append(node("p", `Κατάσταση: ${record.status === "available" ? "Διαθέσιμο" : "Δεν είναι διαθέσιμο — δεν επιτρέπεται παράδοση"}`));
          const checkout = act("Παράδοση — επιβεβαίωση δανεισμού", () => execute(async () => {
            if (!await confirmAction(`Παραδίδετε το «${record.title}» στο μέλος ${record.member_code};`)) return;
            await rpc("lending_checkout", { book_id: record.book_id, member_code: record.member_code, request_id: record.id });
            await load();
            message("Ο δανεισμός καταχωρίστηκε. Το βιβλίο εμφανίζεται κόκκινο «Δανεισμένο».");
          }));
          checkout.disabled = record.status !== "available";
          card.append(checkout, act("Ακύρωση αιτήματος", () => execute(async () => {
            if (!await confirmAction("Να ακυρωθεί αυτό το αίτημα;")) return;
            await rpc("lending_reject", { request_id: record.id });
            await load();
            message("Το αίτημα ακυρώθηκε.");
          })));
        } else card.append(act("Το βιβλίο επιστράφηκε", () => execute(async () => {
          if (!await confirmAction("Παραλάβατε πίσω το βιβλίο; Θα γίνει πράσινο «Διαθέσιμο».")) return;
          await rpc("lending_return", { loan_id: record.id });
          await load();
          message("Η επιστροφή καταχωρίστηκε.");
        })));
      }
      body.append(card);
    }
    const pagination = node("div", undefined, "library-pagination");
    const previous = act("Προηγούμενη σελίδα", () => execute(async () => { page--; await load(); }));
    const next = act("Επόμενη σελίδα", () => execute(async () => { page++; await load(); }));
    previous.disabled = page <= 1;
    next.disabled = page * 20 >= data.total;
    pagination.append(previous, next);
    body.append(pagination);
  }
  load().catch(error => { if (!disposed) { message(lendingError(error), "error"); body.append(act("Νέα προσπάθεια", () => execute(load))); } });
  return () => { disposed = true; ++generation; root.replaceChildren(); };
}
