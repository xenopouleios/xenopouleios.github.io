import { client, configured, loadContent } from "./cms.js";
import { allFields, normalizeContent, readDefaults, safeImageUrl, sections, validateContent } from "./content.js";
import { mountMemberPortal } from "./member-portal.js";
import "./library.css";

const defaults = readDefaults(document);
const previewId = new URL(location.href).searchParams.get("preview");
const requestedPage = location.pathname.split("/").pop().replace(/\.html$/, "");
const activePage = sections.some(([id]) => id === requestedPage) ? requestedPage : null;
if (activePage) document.body.dataset.page = activePage;
const header = document.querySelector(".header-inner");
const menuToggle = document.querySelector(".menu-toggle");
const navigationGroups = [...document.querySelectorAll(".nav-group")];
function setMobileMenuOpen(open) {
  header.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Κλείσιμο μενού" : "Άνοιγμα μενού");
}
menuToggle.addEventListener("click", () => {
  setMobileMenuOpen(menuToggle.getAttribute("aria-expanded") !== "true");
});
for (const group of navigationGroups) {
  group.addEventListener("toggle", () => {
    if (group.open) navigationGroups.filter(item => item !== group).forEach(item => { item.open = false; });
  });
}
document.addEventListener("click", event => {
  if (!event.target.closest("nav")) navigationGroups.forEach(group => { group.open = false; });
  if (!event.target.closest(".header-inner")) setMobileMenuOpen(false);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    const openSummary = document.querySelector(".nav-group[open] summary");
    const menuWasOpen = menuToggle.getAttribute("aria-expanded") === "true";
    navigationGroups.forEach(group => { group.open = false; });
    setMobileMenuOpen(false);
    (menuWasOpen ? menuToggle : openSummary)?.focus();
  }
});
document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", () => setMobileMenuOpen(false));
});
window.addEventListener("resize", () => {
  if (window.innerWidth > 760) setMobileMenuOpen(false);
});

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
  const currentNavigation = document.querySelector('nav [aria-current="page"]');
  (currentNavigation.closest(".nav-group")?.querySelector("summary") || currentNavigation).scrollIntoView({ block: "nearest", inline: "nearest" });
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

if (activePage === "epikoinonia") {
  const map = document.querySelector(".contact-map iframe");
  map.src = map.dataset.src;
}

const publicContactEmails = ["xenopouleios.bibliothiki@gmail.com", "filoixenopouliou@gmail.com"];
function linkPublicContactEmails() {
  const body = document.querySelector("#epikoinonia .detail-body");
  if (!body) return;
  const copy = body.cloneNode(true);
  copy.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  const pattern = new RegExp(`(${publicContactEmails.map(email => email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  const fragment = document.createDocumentFragment();
  for (const part of copy.textContent.split(pattern)) {
    if (publicContactEmails.includes(part)) {
      const link = document.createElement("a");
      link.href = `mailto:${part}`;
      link.textContent = part;
      fragment.append(link);
    } else {
      fragment.append(part);
    }
  }
  body.replaceChildren(fragment);
  body.classList.add("content-text");
}
linkPublicContactEmails();

const contactForm = document.querySelector(".contact-form");
const contactFormOpenedAt = Date.now();
const contactEmailEnabled = import.meta.env.VITE_CONTACT_EMAIL_ENABLED === "true";
if (contactEmailEnabled && contactForm) {
  contactForm.querySelector("button[type=submit]").disabled = false;
  contactForm.querySelector(".contact-form-status").textContent = "";
}
contactForm?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!contactEmailEnabled) return;
  const data = new FormData(event.currentTarget);
  const button = contactForm.querySelector("button[type=submit]");
  const status = contactForm.querySelector(".contact-form-status");
  status.textContent = "";
  status.classList.remove("is-error");
  button.disabled = true;
  try {
    if (!configured) throw new Error("Η φόρμα επικοινωνίας δεν έχει συνδεθεί ακόμη.");
    const { error } = await client.functions.invoke("contact-email", {
      body: {
        name: data.get("name"),
        email: data.get("email"),
        subject: data.get("subject"),
        message: data.get("message"),
        website: data.get("website"),
        opened_at: contactFormOpenedAt,
      },
    });
    if (error) throw error;
    contactForm.reset();
    status.textContent = "Το μήνυμά σας στάλθηκε. Θα επικοινωνήσουμε μαζί σας το συντομότερο δυνατό.";
  } catch (error) {
    console.error("Contact email failed", error.message);
    status.textContent = "Το μήνυμα δεν στάλθηκε. Δοκιμάστε ξανά σε λίγο ή χρησιμοποιήστε ένα από τα email επικοινωνίας.";
    status.classList.add("is-error");
  } finally {
    button.disabled = false;
  }
});

export function renderContent(content) {
  validateContent(content);
  content = normalizeContent(content, defaults);
  for (const [id, selector] of allFields) {
    const value = content.fields[id];
    if (value !== undefined && value !== defaults[id]) {
      const element = document.querySelector(selector);
      element.textContent = value;
      element.classList.add("content-text");
    }
  }
  linkPublicContactEmails();
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
