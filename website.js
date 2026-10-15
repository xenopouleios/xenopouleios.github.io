import { configured, loadContent } from "./cms.js";
import { allFields, readDefaults, safeImageUrl, validateContent } from "./content.js";

const defaults = readDefaults(document);

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
  if (content.fields["site-name"]) document.title = `${content.fields["site-name"]} — Βιβλία, μνήμη, δημιουργία`;
}

const previewId = new URL(location.href).searchParams.get("preview");
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
