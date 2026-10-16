import { configured, loadContent } from "./cms.js";
import { allFields, readDefaults, safeImageUrl, sections, validateContent } from "./content.js";
import { mountMemberPortal } from "./member-portal.js";
import "./library.css";

const defaults = readDefaults(document);
const previewId = new URL(location.href).searchParams.get("preview");
const requestedPage = location.pathname.split("/").pop().replace(/\.html$/, "");
const activePage = sections.some(([id]) => id === requestedPage) ? requestedPage : null;
if (activePage) document.body.dataset.page = activePage;

function pageUrl(id = "") {
  const url = new URL(id ? `./${id}.html` : "./", location.href);
  if (previewId) url.searchParams.set("preview", previewId);
  return url.href;
}

for (const [id] of sections) {
  document.querySelectorAll(`a[data-section="${id}"]`).forEach(link => {
    link.href = pageUrl(id);
    if (activePage === id) link.setAttribute("aria-current", "page");
  });
}
document.querySelectorAll(".brand, .footer-brand").forEach(link => { link.href = pageUrl(); });
if (activePage) {
  const section = document.getElementById(activePage);
  section.classList.add("current-section");
  section.querySelector("h2").setAttribute("role", "heading");
  section.querySelector("h2").setAttribute("aria-level", "1");
  const breadcrumb = document.createElement("a");
  breadcrumb.href = pageUrl();
  breadcrumb.className = "back-home";
  breadcrumb.textContent = "← Επιστροφή στην αρχική";
  document.querySelector(".details").prepend(breadcrumb);
  document.querySelector('nav [aria-current="page"]').scrollIntoView({ block: "nearest", inline: "nearest" });
}

function updateTitle() {
  const name = document.querySelector(".brand-name").textContent;
  document.title = activePage ? `${document.querySelector(`#${activePage} h2`).textContent} — ${name}` : `${name} — Βιβλία, μνήμη, δημιουργία`;
}
updateTitle();

if (activePage === "daneistiki") {
  const catalog = document.createElement("div");
  document.querySelector("#daneistiki h2").parentElement.append(catalog);
  if (configured) mountMemberPortal(catalog);
  else catalog.textContent = "Ο κατάλογος βιβλίων δεν έχει συνδεθεί ακόμη.";
}

export function renderContent(content) {
  validateContent(content);
  for (const [id, selector] of allFields) {
    const value = content.fields[id];
    if (value !== undefined && value !== defaults[id]) {
      const element = document.querySelector(selector);
      element.textContent = value;
      element.classList.add("content-text");
    }
  }
  for (const [id, image] of Object.entries(content.images)) {
    if (!image.url) continue;
    const img = document.createElement("img");
    img.src = safeImageUrl(image.url);
    img.alt = image.alt;
    if (id === "logo") {
      img.className = "brand-logo";
      document.querySelector(".brand-logo").replaceWith(img);
    } else {
      img.className = "content-image";
      if (id === "hero") document.querySelector(".library-art").replaceWith(img);
      else document.querySelector(`#${id} h2`).after(img);
    }
  }
  for (const post of [...content.posts].sort((a, b) => b.date.localeCompare(a.date))) {
    const article = document.createElement("article");
    article.className = "published-post";
    const time = document.createElement("time");
    time.dateTime = post.date;
    time.textContent = new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(post.date));
    const title = document.createElement("h3");
    title.textContent = post.title;
    article.append(time, title);
    if (post.image) {
      const image = document.createElement("img");
      image.src = safeImageUrl(post.image);
      image.alt = post.alt;
      image.className = "content-image";
      image.loading = "lazy";
      article.append(image);
    }
    const body = document.createElement("p");
    body.className = "content-text";
    body.textContent = post.body;
    article.append(body);
    document.querySelector(`#${post.section} h2`).parentElement.append(article);
  }
  updateTitle();
}

if (previewId) {
  try {
    const raw = sessionStorage.getItem(`xenopouleio-preview-${previewId}`);
    if (!raw) throw new Error("Η προεπισκόπηση δεν είναι πλέον διαθέσιμη. Ανοίξτε την ξανά από τη διαχείριση.");
    renderContent(JSON.parse(raw));
    const banner = document.createElement("p");
    banner.className = "load-error";
    banner.textContent = "ΠΡΟΕΠΙΣΚΟΠΗΣΗ — Αυτές οι αλλαγές δεν έχουν δημοσιευτεί.";
    document.body.prepend(banner);
  } catch (error) {
    showError(error.message);
  }
} else if (configured) {
  loadContent().then(({ document: content }) => renderContent(content)).catch(error => {
    console.error("Content loading failed", error);
    showError("Δεν ήταν δυνατή η φόρτωση των ενημερώσεων. Εμφανίζεται η αρχική έκδοση. Δοκιμάστε ανανέωση της σελίδας.");
  });
}

function showError(message) {
  const banner = document.createElement("p");
  banner.className = "load-error";
  banner.setAttribute("role", "alert");
  banner.textContent = message;
  document.body.prepend(banner);
}
