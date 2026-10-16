import { client } from "./cms.js";
import { bookFields, bookStatuses } from "./library-data.js";
export { bookFields, bookStatuses, bookValues, fieldLimits } from "./library-data.js";

export async function searchBooks(term = "", page = 1) {
  const { data, error } = await client.rpc("library_search", { search_term: term.trim(), page_number: page, page_size: 20 });
  if (error) throw error;
  return data;
}

export function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function bookCard(book, { requestLoan } = {}) {
  const article = node("article", undefined, "library-book");
  const disclosure = node("details");
  const summary = node("summary", undefined, "book-row");
  for (const [key, label] of [["classification_code", "Ταξινομικός αριθμός"], ["title", "Τίτλος βιβλίου"], ["author", "Συγγραφέας"]]) {
    const cell = node("span", book[key] || "—", `book-${key}`);
    cell.title = `${label}: ${book[key] || "Δεν αναφέρεται"}`;
    summary.append(cell);
  }
  const availability = node("span", bookStatuses[book.status], `library-availability availability-${book.status}`);
  availability.title = bookStatuses[book.status];
  summary.append(availability);
  disclosure.append(summary);
  const details = node("dl");
  for (const [key, label] of bookFields.slice(1)) {
    if (!book[key]) continue;
    const value = node("dd");
    if (book[key].length > 200) {
      const disclosure = node("details");
      disclosure.append(node("summary", "Μεγάλη καταχώριση — προβολή πλήρους κειμένου"), node("p", book[key]));
      value.append(disclosure);
    } else value.textContent = book[key];
    details.append(node("dt", label), value);
  }
  details.append(node("dt", "Διαθεσιμότητα"), node("dd", bookStatuses[book.status], `availability-${book.status}`));
  disclosure.append(details);
  if (requestLoan) {
    const request = node("button", "Αίτημα δανεισμού");
    request.type = "button";
    request.disabled = book.status !== "available";
    request.addEventListener("click", () => requestLoan(book, request));
    disclosure.append(request, node("p", "Το αίτημα δεν αποτελεί κράτηση. Ο δανεισμός επιβεβαιώνεται από τον διαχειριστή κατά την παράδοση."));
  }
  article.append(disclosure);
  return article;
}

export function mountCatalog(root, options = {}) {
  root.classList.add("library-catalog");
  root.append(node("h3", "Αναζήτηση στον κατάλογο βιβλίων"),
    node("p", "Ανοίξτε το βελάκι για τα πλήρη στοιχεία. Πράσινο: διαθέσιμο · Κόκκινο: δανεισμένο. Όπου δεν έχει γίνει έλεγχος, η διαθεσιμότητα αναγράφεται ως μη επιβεβαιωμένη."));
  const form = node("form", undefined, "library-search");
  const label = node("label", "Τίτλος, συγγραφέας, εκδότης ή αριθμός");
  const input = node("input");
  input.id = "library-query";
  input.type = "search";
  input.maxLength = 200;
  label.htmlFor = input.id;
  const submit = node("button", "Αναζήτηση");
  form.append(label, input, submit);
  const status = node("p");
  status.setAttribute("role", "status");
  const results = node("div");
  const pagination = node("div", undefined, "library-pagination");
  const previous = node("button", "Προηγούμενη σελίδα");
  const next = node("button", "Επόμενη σελίδα");
  const pageLabel = node("span");
  previous.type = next.type = "button";
  pagination.append(previous, pageLabel, next);
  root.append(form, status, results, pagination);
  let page = 1;
  let term = "";
  let loading = false;
  let disposed = false;
  async function load(targetPage) {
    if (loading) return;
    loading = true;
    submit.disabled = previous.disabled = next.disabled = true;
    results.setAttribute("aria-busy", "true");
    status.textContent = "Φόρτωση βιβλίων…";
    try {
      const data = await searchBooks(term, targetPage);
      if (disposed) return;
      page = targetPage;
      results.replaceChildren(...data.items.map(book => bookCard(book, options)));
      status.textContent = data.total === 1 ? "Βρέθηκε 1 εγγραφή." : data.total ? `Βρέθηκαν ${data.total.toLocaleString("el-GR")} εγγραφές.` : "Δεν βρέθηκαν βιβλία με αυτά τα στοιχεία.";
      pageLabel.textContent = data.total ? `Σελίδα ${page} από ${Math.ceil(data.total / 20)}` : "";
      previous.disabled = page <= 1;
      next.disabled = page * 20 >= data.total;
    } catch (error) {
      if (disposed) return;
      console.error("Library search failed", error);
      results.replaceChildren();
      pageLabel.textContent = "";
      status.textContent = "Δεν φορτώθηκε ο κατάλογος. Ελέγξτε τη σύνδεσή σας και πατήστε «Αναζήτηση» για νέα προσπάθεια.";
    } finally {
      loading = false;
      submit.disabled = false;
      results.setAttribute("aria-busy", "false");
    }
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (loading) return;
    term = input.value.trim();
    load(1);
  });
  previous.addEventListener("click", () => load(page - 1));
  next.addEventListener("click", () => load(page + 1));
  load(1);
  return () => { disposed = true; root.replaceChildren(); };
}
