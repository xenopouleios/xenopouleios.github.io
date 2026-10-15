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

export function bookCard(book) {
  const article = node("article", undefined, "library-book");
  article.append(node("h3", book.title));
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
  article.append(details, node("p", bookStatuses[book.status], "library-availability"));
  return article;
}

export function mountCatalog(root) {
  root.classList.add("library-catalog");
  root.append(node("h3", "Αναζήτηση στον κατάλογο βιβλίων"),
    node("p", "Αναζητήστε με τίτλο, συγγραφέα, εκδότη ή αριθμό. Κάθε εγγραφή προέρχεται από τον κατάλογο της βιβλιοθήκης· η εμφάνισή της δεν σημαίνει ότι είναι διαθέσιμη για δανεισμό. Για επιβεβαίωση, επικοινωνήστε με τη βιβλιοθήκη."));
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
  async function load(targetPage) {
    if (loading) return;
    loading = true;
    submit.disabled = previous.disabled = next.disabled = true;
    results.setAttribute("aria-busy", "true");
    status.textContent = "Φόρτωση βιβλίων…";
    try {
      const data = await searchBooks(term, targetPage);
      page = targetPage;
      results.replaceChildren(...data.items.map(bookCard));
      status.textContent = data.total === 1 ? "Βρέθηκε 1 εγγραφή." : data.total ? `Βρέθηκαν ${data.total.toLocaleString("el-GR")} εγγραφές.` : "Δεν βρέθηκαν βιβλία με αυτά τα στοιχεία.";
      pageLabel.textContent = data.total ? `Σελίδα ${page} από ${Math.ceil(data.total / 20)}` : "";
      previous.disabled = page <= 1;
      next.disabled = page * 20 >= data.total;
    } catch (error) {
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
}
