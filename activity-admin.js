import { client } from "./cms.js";
import { node } from "./library.js";

export function mountActivityAdmin(root, { run, message, confirmAction, demo }) {
  root.classList.add("library-catalog");
  root.append(node("p", "ΙΔΙΩΤΙΚΗ ΔΙΑΧΕΙΡΙΣΗ — Οι δηλώσεις συμμετοχής και τα τηλέφωνα είναι ορατά μόνο στους διαχειριστές."));
  if (demo) {
    root.append(node("p", "Συνδεθείτε ως διαχειριστής για πρόσβαση."));
    return () => root.replaceChildren();
  }
  const tabs = node("div", undefined, "actions");
  const body = node("div");
  root.append(tabs, body);
  let kind = "all";
  let page = 1;
  let disposed = false;
  let generation = 0;
  const button = (text, action, className = "secondary") => {
    const control = node("button", text, className);
    control.type = "button";
    control.addEventListener("click", action);
    return control;
  };
  const execute = action => run(async () => {
    try {
      await action();
    } catch (error) {
      if (!disposed) message(error.code === "42501" ? "Δεν έχετε δικαίωμα προβολής των δηλώσεων." : "Δεν ολοκληρώθηκε η ενέργεια. Δοκιμάστε ξανά.", "error");
    }
  });
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  for (const [key, label] of [["all", "Όλες"], ["child", "Για παιδιά"], ["adult", "Για ενήλικες"]]) {
    tabs.append(button(label, () => execute(async () => {
      kind = key;
      page = 1;
      await load();
    })));
  }
  async function load() {
    const current = ++generation;
    const data = await rpc("activity_registrations", { list_kind: kind, page_number: page });
    if (disposed || current !== generation) return;
    body.replaceChildren(node("h3", "Δηλώσεις συμμετοχής"), button("Ανανέωση", () => execute(load)));
    const pages = Math.max(1, Math.ceil(data.total / 20));
    body.append(node("p", `${data.total.toLocaleString("el-GR")} δηλώσεις · Σελίδα ${page} από ${pages}`));
    if (!data.items.length) body.append(node("p", "Δεν υπάρχουν δηλώσεις σε αυτή την κατηγορία."));
    for (const registration of data.items) {
      const card = node("article", undefined, "library-book");
      card.append(
        node("h4", registration.activity_title),
        node("p", registration.activity_kind === "child" ? "Δράση για παιδιά" : "Δράση για ενήλικες"),
      );
      const details = node("dl");
      details.append(node("dt", registration.activity_kind === "child" ? "Ονοματεπώνυμο παιδιού" : "Ονοματεπώνυμο"), node("dd", registration.participant_name));
      if (registration.activity_kind === "child") details.append(node("dt", "Ονοματεπώνυμο γονέα"), node("dd", registration.guardian_name));
      details.append(
        node("dt", "Τηλέφωνο"), node("dd", registration.phone),
        node("dt", "Ημερομηνία δήλωσης"), node("dd", new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeStyle: "short" }).format(new Date(registration.created_at))),
      );
      card.append(details, button("Διαγραφή δήλωσης", () => execute(async () => {
        if (!await confirmAction("Η δήλωση και τα προσωπικά στοιχεία θα διαγραφούν οριστικά. Να συνεχίσουμε;", "Διαγραφή δήλωσης;")) return;
        await rpc("activity_registration_delete", { registration_id: registration.id });
        await load();
        message("Η δήλωση διαγράφηκε.");
      }), "danger"));
      body.append(card);
    }
    const navigation = node("div", undefined, "actions");
    const previous = button("← Προηγούμενη", () => execute(async () => { --page; await load(); }));
    const next = button("Επόμενη →", () => execute(async () => { ++page; await load(); }));
    previous.disabled = page <= 1;
    next.disabled = page >= pages;
    navigation.append(previous, next);
    body.append(navigation);
  }
  execute(load);
  return () => {
    disposed = true;
    ++generation;
    root.replaceChildren();
  };
}
