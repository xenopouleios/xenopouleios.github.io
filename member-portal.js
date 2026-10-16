import { createClient } from "@supabase/supabase-js";
import { client } from "./cms.js";
import { node, mountCatalog } from "./library.js";
import { applicationFields, applicationValues, lendingError } from "./lending-data.js";

export function mountMemberPortal(root) {
  const authParams = new URLSearchParams(location.hash.slice(1));
  const linkError = authParams.has("error");
  const auth = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey: "xenopouleio-member-auth", storage: sessionStorage },
  });
  root.classList.add("library-catalog");
  const tabs = node("div", undefined, "library-tabs");
  const status = node("p");
  status.setAttribute("role", "status");
  const body = node("div");
  root.append(tabs, status, body);
  let mode = "books";
  let generation = 0;
  let disposeCatalog = null;
  let busy = false;
  let hidden = false;
  let passwordRequired = ["invite", "recovery"].includes(authParams.get("type"));
  const controls = new Map();
  const act = (label, action) => {
    const button = node("button", label);
    button.type = "button";
    button.addEventListener("click", action);
    return button;
  };
  async function perform(action) {
    if (busy) return;
    busy = true;
    const current = generation;
    const disabled = [...root.querySelectorAll("button")].map(button => [button, button.disabled]);
    disabled.forEach(([button]) => { button.disabled = true; });
    status.textContent = "Παρακαλώ περιμένετε…";
    try { await action(); }
    catch (error) {
      if (current === generation && !hidden) status.textContent = lendingError(error);
    } finally {
      busy = false;
      disabled.forEach(([button, value]) => { button.disabled = value; });
      if (!hidden && current !== generation && !body.hasChildNodes()) show(mode);
    }
  }
  function input(form, key, label, type = "text", limit = 300, required = true) {
    const caption = node("label", label);
    const control = node("input");
    control.id = `portal-${key}`;
    control.name = key;
    control.type = type;
    control.maxLength = limit;
    control.required = required;
    caption.htmlFor = control.id;
    form.append(caption, control);
    return control;
  }
  async function rpc(name, args) {
    const { data, error } = await auth.rpc(name, args);
    if (error) throw error;
    return data;
  }
  function clear() {
    ++generation;
    disposeCatalog?.();
    disposeCatalog = null;
    body.replaceChildren();
    status.textContent = "";
  }
  function show(next) {
    if (busy) return;
    clear();
    mode = next;
    for (const [key, button] of controls) button.setAttribute("aria-pressed", String(key === mode));
    if (mode === "books") {
      disposeCatalog = mountCatalog(body, { requestLoan: (book, button) => perform(async () => {
        const { data: { session } } = await auth.auth.getSession();
        if (!session) {
          status.textContent = "Για αίτημα δανεισμού, επιλέξτε «Σύνδεση μέλους». Αν δεν έχετε λογαριασμό, συμπληρώστε την εγγραφή.";
          return;
        }
        await rpc("member_request", { book_id: book.id });
        button.textContent = "Το αίτημα υποβλήθηκε";
        status.textContent = "Το αίτημα στάλθηκε. Δεν είναι κράτηση: η διαθεσιμότητα επιβεβαιώνεται κατά την παράδοση.";
      }) });
    } else if (mode === "register") registration();
    else login();
  }
  for (const [key, label] of [["register", "Εγγραφή μέλους"], ["login", "Σύνδεση μέλους"], ["books", "Βιβλία"]]) {
    const button = act(label, () => show(key));
    controls.set(key, button);
    tabs.append(button);
  }
  function registration() {
    const form = node("form", undefined, "library-form");
    form.autocomplete = "off";
    form.append(node("h3", "Αίτηση εγγραφής μέλους"),
      node("p", "Τα στοιχεία αποστέλλονται μόνο στη διαχείριση της βιβλιοθήκης και δεν δημοσιεύονται. Μετά τον έλεγχο θα λάβετε προσωπικό email με αριθμό μητρώου και σύνδεσμο για να ορίσετε κωδικό. Αν είστε ήδη μέλος, δηλώστε το στη βιβλιοθήκη ώστε να συνδεθεί η υπάρχουσα εγγραφή σας."));
    const minor = input(form, "is_minor", "Το μέλος είναι ανήλικο", "checkbox", 1, false);
    const fields = new Map(applicationFields.map(([key, label, limit, type]) =>
      [key, input(form, key, label, type, limit, key !== "guardian_name")]));
    minor.addEventListener("change", () => { fields.get("guardian_name").required = minor.checked; });
    const consent = input(form, "consent", "Διάβασα ότι τα στοιχεία θα χρησιμοποιηθούν για την εξέταση της αίτησης και τη διαχείριση των δανεισμών. Για ανήλικο, η αίτηση υποβάλλεται από γονέα/κηδεμόνα.", "checkbox");
    consent.required = true;
    form.append(node("p", "Δηλώστε μόνο τον αριθμό ταυτότητας ή διαβατηρίου που σας ζητά η βιβλιοθήκη, όχι φωτογραφία εγγράφου. Τα υποχρεωτικά στοιχεία ανήκουν στο μέλος· για ανήλικο χρησιμοποιήστε στοιχεία επικοινωνίας γονέα/κηδεμόνα."),
      node("button", "Υποβολή αίτησης εγγραφής"));
    form.addEventListener("submit", event => {
      event.preventDefault();
      let values;
      try {
        values = applicationValues({ ...Object.fromEntries([...fields].map(([key, control]) => [key, control.value])), is_minor: minor.checked });
      } catch (error) { status.textContent = error.message; return; }
      perform(async () => {
        const { error } = await client.rpc("membership_apply", { application_data: values });
        if (error) throw error;
        if (hidden || mode !== "register") return;
        form.reset();
        fields.get("guardian_name").required = false;
        body.replaceChildren(node("p", "Η υποβολή ολοκληρώθηκε. Αν υπάρχει ήδη αίτηση με αυτό το email, διατηρείται η υπάρχουσα. Περιμένετε το προσωπικό email της βιβλιοθήκης μετά τον έλεγχο."));
        status.textContent = "Η αίτηση περιμένει έλεγχο από τον διαχειριστή.";
      });
    });
    body.append(form);
  }
  async function login() {
    const current = generation;
    const { data: { session }, error } = await auth.auth.getSession();
    if (current !== generation || hidden) return;
    if (error) { status.textContent = lendingError(error); return; }
    if (session) { await account(current); return; }
    const form = node("form", undefined, "library-form");
    form.append(node("h3", "Σύνδεση μέλους"), node("p", "Η σύνδεση ενεργοποιείται αφού εγκριθεί η αίτηση και ορίσετε κωδικό από το προσωπικό email της βιβλιοθήκης."));
    const email = input(form, "login-email", "Email", "email", 254);
    email.autocomplete = "username";
    const password = input(form, "login-password", "Προσωπικός κωδικός", "password", 128);
    password.autocomplete = "current-password";
    form.append(node("button", "Σύνδεση"), node("p", "Αν ξεχάσατε τον κωδικό ή έληξε ο σύνδεσμος ενεργοποίησης, επικοινωνήστε με τη βιβλιοθήκη για νέο προσωπικό σύνδεσμο."));
    form.addEventListener("submit", event => {
      event.preventDefault();
      perform(async () => {
        const { error } = await auth.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        password.value = "";
        if (error) throw error;
        await account(generation);
      });
    });
    body.append(form);
  }
  async function account(current) {
    try {
      const data = await rpc("member_account");
      if (current !== generation || hidden) return;
      body.replaceChildren(node("h3", `Καλώς ήρθατε, ${data.full_name}`), node("p", `Αριθμός μητρώου: ${data.member_code}`));
      const logout = act("Αποσύνδεση μέλους", () => perform(async () => {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) throw error;
        clear();
        body.append(node("p", "Αποσυνδεθήκατε. Πατήστε «Σύνδεση μέλους» για νέα είσοδο."));
      }));
      body.append(logout);
      if (passwordRequired) {
        const form = node("form", undefined, "library-form");
        form.append(node("h3", "Ορίστε τον προσωπικό σας κωδικό"));
        const password = input(form, "new-password", "Νέος κωδικός (τουλάχιστον 12 χαρακτήρες)", "password", 128);
        password.minLength = 12;
        password.autocomplete = "new-password";
        const confirmation = input(form, "confirm-password", "Επανάληψη κωδικού", "password", 128);
        confirmation.autocomplete = "new-password";
        form.append(node("button", "Αποθήκευση κωδικού"));
        form.addEventListener("submit", event => {
          event.preventDefault();
          if (password.value !== confirmation.value) { status.textContent = "Οι δύο κωδικοί δεν ταιριάζουν."; return; }
          perform(async () => {
            const { error } = await auth.auth.updateUser({ password: password.value });
            if (error) throw error;
            password.value = confirmation.value = "";
            passwordRequired = false;
            status.textContent = "Ο προσωπικός κωδικός αποθηκεύτηκε.";
            await account(generation);
          });
        });
        body.append(form);
        return;
      }
      body.append(act("Νέος δανεισμός — επιλογή βιβλίου", () => show("books")), node("h4", "Οι δανεισμοί μου"));
      if (!data.loans.length) body.append(node("p", "Δεν υπάρχουν καταχωρισμένοι δανεισμοί."));
      body.append(node("p", "Εμφανίζονται έως 100 πρόσφατοι δανεισμοί, με προτεραιότητα στους ενεργούς."));
      for (const loan of data.loans) body.append(node("p", `${loan.title} · ${loan.classification_code || "—"} · ${loan.returned_at ? "Επιστράφηκε" : "Σε δανεισμό"} · ${new Date(loan.borrowed_at).toLocaleDateString("el-GR")}`));
      body.append(node("h4", "Αιτήματα που περιμένουν παράδοση"));
      if (!data.requests.length) body.append(node("p", "Δεν υπάρχουν εκκρεμή αιτήματα."));
      for (const request of data.requests) {
        const row = node("div");
        row.append(node("p", request.title), act("Ακύρωση αιτήματος", () => perform(async () => {
          await rpc("member_cancel", { request_id: request.id });
          await account(generation);
          status.textContent = "Το αίτημα ακυρώθηκε.";
        })));
        body.append(row);
      }
      status.textContent = "";
    } catch (error) {
      if (current !== generation || hidden) return;
      body.replaceChildren(node("p", lendingError(error)));
      body.append(act("Αποσύνδεση", () => perform(async () => {
        const { error } = await auth.auth.signOut({ scope: "local" });
        if (error) throw error;
        clear();
        body.append(node("p", "Αποσυνδεθήκατε."));
      })));
    }
  }
  const { data: { subscription } } = auth.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") {
      clear();
      body.append(node("p", "Η συνεδρία μέλους έκλεισε. Επιλέξτε «Σύνδεση μέλους» για νέα είσοδο."));
    }
    if (event === "PASSWORD_RECOVERY") passwordRequired = true;
  });
  window.addEventListener("pagehide", () => { hidden = true; clear(); });
  window.addEventListener("pageshow", event => { if (event.persisted) { hidden = false; show(mode); } });
  window.addEventListener("storage", event => {
    if (event.key === "xenopouleio-member-auth" && !event.newValue) clear();
  });
  show(passwordRequired || authParams.has("access_token") || linkError ? "login" : "books");
  if (linkError) status.textContent = "Ο προσωπικός σύνδεσμος δεν είναι πλέον έγκυρος. Ζητήστε νέο από τη βιβλιοθήκη ή συνδεθείτε με τον κωδικό σας.";
  return () => { hidden = true; clear(); subscription.unsubscribe(); };
}
