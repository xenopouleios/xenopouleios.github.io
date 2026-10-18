import { client, configured, loadContent } from "./cms.js";
import { activitySections, ageRangeSections, allFields, cardSections, normalizeContent, readDefaults, safeImageUrl, sections, validateContent } from "./content.js";
import { mountMemberPortal } from "./member-portal.js";
import { mountBlogArchive } from "./blog-archive.js";
import friendsLogoUrl from "./friends-logo.png";
import "./library.css";

const defaults = readDefaults(document);
const previewId = new URL(location.href).searchParams.get("preview");
const activityRegistrationsEnabled = import.meta.env.VITE_ACTIVITY_REGISTRATIONS_ENABLED === "true";
const requestedPage = location.pathname.split("/").pop().replace(/\.html$/, "");
const activityPage = requestedPage === "drastiriotita";
const activePage = sections.some(([id]) => id === requestedPage) ? requestedPage : null;
if (activePage) document.body.dataset.page = activePage;
if (activityPage) document.body.dataset.activityDetail = "";
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

const revealObserver = !window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window
  ? new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" })
  : null;

function revealVisibleElements() {
  document.querySelectorAll(".scroll-reveal:not(.is-visible)").forEach(element => {
    const bounds = element.getBoundingClientRect();
    if (bounds.top >= window.innerHeight || bounds.bottom <= 0) return;
    element.classList.add("is-visible");
    revealObserver?.unobserve(element);
  });
}

window.addEventListener("scroll", revealVisibleElements, { passive: true });
window.addEventListener("resize", revealVisibleElements);

function observeScrollReveals() {
  const groups = [
    ".hero > *",
    ".discover .section-heading > *",
    ".cards > .card",
    ".intro-band > .page-width > *",
    ".detail.current-section > *",
    ".activity-cards > .activity-card",
    ".activity-detail > *",
    ".published-post",
    ".site-notice > *",
    ".footer-support",
    ".footer-grid > *",
    ".footer-bottom > *",
  ];
  for (const selector of groups) {
    document.querySelectorAll(selector).forEach((element, index) => {
      if (element.classList.contains("scroll-reveal")) return;
      element.classList.add("scroll-reveal");
      element.style.setProperty("--reveal-delay", `${Math.min(index, 3) * 90}ms`);
      if (revealObserver) revealObserver.observe(element);
      else element.classList.add("is-visible");
    });
  }
  revealVisibleElements();
}

function pageUrl(id = "") {
  const url = new URL(id ? `./${id}.html` : "./", location.href);
  if (previewId) url.searchParams.set("preview", previewId);
  return url.href;
}

function activityUrl(id) {
  const url = new URL("./drastiriotita.html", location.href);
  url.searchParams.set("id", id);
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
  if (!activityPage) document.title = activePage ? `${document.querySelector(`#${activePage} h2`).textContent} — ${name}` : `${name} — Βιβλία, μνήμη, δημιουργία`;
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

function createNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function createActivityCard(post, href, placeholder = "Ξ") {
  const card = createNode("a", undefined, "activity-card");
  card.href = href;
  if (href.startsWith("http")) {
    card.target = "_blank";
    card.rel = "noopener noreferrer";
  }
  if (post.image) {
    const image = createNode("img");
    image.src = safeImageUrl(post.image);
    image.alt = post.alt || "";
    image.loading = "lazy";
    card.append(image);
  } else {
    card.append(createNode("div", placeholder, "activity-card-placeholder"));
  }
  const copy = createNode("div", undefined, "activity-card-copy");
  copy.append(
    createNode("h3", post.title),
    createNode("p", post.summary),
    createNode("span", "Διαβάστε περισσότερα →", "activity-card-link"),
  );
  card.append(copy);
  return card;
}

function sortActivityGrid(grid, ascending) {
  const cards = [...grid.querySelectorAll(".activity-card")];
  cards.sort((a, b) => {
    const aDate = a.dataset.activityDate;
    const bDate = b.dataset.activityDate;
    if (!aDate) return bDate ? 1 : 0;
    if (!bDate) return -1;
    return ascending ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  });
  grid.append(...cards);
}

function archivedPostWithOverride(post, audience, overrides) {
  const override = overrides[post.id];
  if (override?.hidden) return null;
  return override ? { ...post, audience, ...override, archivedOverride: true } : { ...post, audience };
}

async function mountPreviousActivityArchive(activityGrids, overrides) {
  if (!activitySections.has(activePage)) return;
  try {
    const targetAudience = activePage === "draseis-paidia" ? "children" : "adults";
    const response = await fetch(new URL(`./activity-archive-${targetAudience}.json`, location.href));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive = await response.json();
    if (!Array.isArray(archive.posts)) throw new Error("Μη έγκυρο αρχείο προηγούμενων δράσεων.");
    const sourceIds = new Set(archive.posts.map(post => post.id));
    const posts = archive.posts.map(post => archivedPostWithOverride(post, targetAudience, overrides));
    for (const [id, override] of Object.entries(overrides)) {
      if (!override.hidden && override.audience === targetAudience && !sourceIds.has(id)) {
        posts.push({ id, originalUrl: "", ...override, archivedOverride: true });
      }
    }
    const grid = activityGrids.get(`${activePage}:previous`);
    for (const post of posts.filter(post => post && post.audience === targetAudience)) {
      if (!post || !["title", "date", "summary", "image", "originalUrl"].every(field => typeof post[field] === "string")) {
        throw new Error("Μη έγκυρη προηγούμενη δράση.");
      }
      const card = createActivityCard(post, activityUrl(post.id));
      card.dataset.activityDate = post.event_date ?? post.date;
      grid.append(card);
    }
    sortActivityGrid(grid, false);
    grid.dispatchEvent(new Event("cardschange"));
    observeScrollReveals();
  } catch (error) {
    console.error("Previous activity archive loading failed", error);
    const grid = activityGrids.get(`${activePage}:previous`);
    grid.replaceChildren(createNode("p", "Δεν ήταν δυνατή η φόρτωση των προηγούμενων δράσεων.", "activity-archive-error"));
  }
}

function activityRegistrationForm(post) {
  const childActivity = post.section === "draseis-paidia";
  const section = createNode("section", undefined, "activity-registration");
  section.setAttribute("aria-labelledby", "registration-title");
  const title = createNode("h2", "Δήλωση συμμετοχής");
  title.id = "registration-title";
  section.append(title);
  if (!post.registration_open) {
    section.append(createNode("p", "Οι δηλώσεις συμμετοχής για αυτή τη δράση είναι κλειστές."));
    return section;
  }
  if (!activityRegistrationsEnabled && !previewId) {
    section.append(createNode("p", "Η ηλεκτρονική δήλωση συμμετοχής θα ενεργοποιηθεί σύντομα."));
    return section;
  }
  const form = createNode("form", undefined, "activity-registration-form");
  const fields = childActivity
    ? [["child_name", "Ονοματεπώνυμο παιδιού", "name"], ["guardian_name", "Ονοματεπώνυμο γονέα", "name"], ["phone", "Τηλέφωνο επικοινωνίας", "tel"]]
    : [["full_name", "Ονοματεπώνυμο", "name"], ["phone", "Τηλέφωνο επικοινωνίας", "tel"]];
  for (const [name, label, autocomplete] of fields) {
    const caption = createNode("label", label);
    const input = createNode("input");
    input.name = name;
    input.type = name === "phone" ? "tel" : "text";
    input.autocomplete = autocomplete;
    input.required = true;
    input.maxLength = name === "phone" ? 50 : 300;
    caption.append(input);
    form.append(caption);
  }
  const privacy = createNode("p", "Τα στοιχεία χρησιμοποιούνται μόνο για την οργάνωση της συγκεκριμένης δράσης και είναι ορατά μόνο στους διαχειριστές.", "activity-registration-note");
  const status = createNode("p", undefined, "activity-registration-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const submit = createNode("button", "Υποβολή συμμετοχής");
  submit.type = "submit";
  form.append(privacy, status, submit);
  if (previewId) {
    submit.disabled = true;
    status.textContent = "Προεπισκόπηση — δεν καταχωρίζονται δηλώσεις συμμετοχής.";
    section.append(form);
    return section;
  }
  form.addEventListener("submit", event => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = "";
    status.classList.remove("is-error");
    const values = Object.fromEntries(new FormData(form));
    client.rpc("activity_register", { activity_id: post.id, registration_data: values }).then(({ error }) => {
      if (error) throw error;
      form.reset();
      status.textContent = "Η δήλωση συμμετοχής καταχωρίστηκε.";
    }).catch(error => {
      console.error("Activity registration failed", error.code ?? error.message);
      status.textContent = "Η δήλωση δεν καταχωρίστηκε. Ελέγξτε τα στοιχεία και δοκιμάστε ξανά.";
      status.classList.add("is-error");
    }).finally(() => { submit.disabled = false; });
  });
  section.append(form);
  return section;
}

async function loadArchivedActivity(id, overrides) {
  const archives = await Promise.all([
    ["children", "draseis-paidia"],
    ["adults", "draseis-enilikes"],
  ].map(async ([audience, section]) => {
    const response = await fetch(new URL(`./activity-archive-${audience}.json`, location.href));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive = await response.json();
    if (!Array.isArray(archive.posts)) throw new Error("Μη έγκυρο αρχείο προηγούμενων δράσεων.");
    return archive.posts.map(post => {
      const merged = archivedPostWithOverride(post, audience, overrides);
      return merged ? { ...merged, section: merged.audience === "children" ? "draseis-paidia" : "draseis-enilikes", archived: true } : null;
    });
  }));
  const post = archives.flat().find(item => item?.id === id);
  if (post && !["title", "date", "content", "image"].every(field => typeof post[field] === "string")) {
    throw new Error("Μη έγκυρη προηγούμενη δράση.");
  }
  return post;
}

async function renderActivityDetail(posts, archiveOverrides) {
  if (!activityPage) return;
  const root = document.querySelector("#activity-detail");
  root.hidden = false;
  const id = new URL(location.href).searchParams.get("id");
  root.replaceChildren(createNode("p", "Φόρτωση δράσης…"));
  let post = posts.find(item => item.id === id && cardSections.has(item.section));
  if (!post && id) {
    try {
      post = await loadArchivedActivity(id, archiveOverrides);
    } catch (error) {
      console.error("Archived activity loading failed", error);
      root.replaceChildren(createNode("h1", "Δεν ήταν δυνατή η φόρτωση της δράσης"), createNode("p", "Δοκιμάστε ξανά σε λίγο."));
      document.title = "Σφάλμα φόρτωσης — Ξενοπούλειο";
      return;
    }
  }
  if (!post) {
    root.replaceChildren(createNode("h1", "Η ανάρτηση δεν βρέθηκε"), createNode("p", "Η ανάρτηση μπορεί να έχει αφαιρεθεί ή η διεύθυνση να μην είναι σωστή."));
    document.title = "Η ανάρτηση δεν βρέθηκε — Ξενοπούλειο";
    return;
  }
  const back = createNode("a", `← ${sections.find(([id]) => id === post.section)[1]}`, "back-home");
  back.href = pageUrl(post.section);
  const article = createNode("article", undefined, "activity-article");
  const detailDate = post.event_date ?? post.date;
  const time = createNode("time", new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(detailDate)));
  time.dateTime = detailDate;
  const title = createNode("h1", post.title);
  article.append(time, title);
  const activityContent = createNode("div", undefined, "activity-content");
  if (post.archivedOverride) {
    activityContent.append(createNode("p", post.body, "activity-full-text"));
  } else if (post.archived) {
    const archivedContent = createNode("div", undefined, "activity-full-text activity-archive-content");
    archivedContent.innerHTML = post.content;
    activityContent.append(archivedContent);
  } else {
    if (post.image) {
      const image = createNode("img", undefined, "activity-hero-image");
      image.src = safeImageUrl(post.image);
      image.alt = post.alt;
      activityContent.append(image);
    }
    activityContent.append(createNode("p", post.body, "activity-full-text"));
  }
  article.append(activityContent);
  if (activitySections.has(post.section)) article.append(activityRegistrationForm(post));
  root.replaceChildren(back, article);
  document.title = `${post.title} — Ξενοπούλειο`;
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
    const imageUrl = safeImageUrl(image.url);
    img.src = id === "filoi" && imageUrl.endsWith("/8adb0ced-4149-4ffc-8e5c-84138a2294ad.png") ? friendsLogoUrl : imageUrl;
    img.alt = image.alt;
    if (id === "logo") {
      img.className = "brand-logo";
      document.querySelector(".brand-logo").replaceWith(img);
    } else {
      img.className = "content-image";
      if (id === "hero") document.querySelector(".library-art").replaceWith(img);
      else document.querySelector(`#${id} .detail-media`).append(img);
    }
  }
  const activityGrids = new Map();
  function cardGrid(section, period = "all") {
    const key = `${section}:${period}`;
    let grid = activityGrids.get(key);
    if (grid) return grid;
    const listing = createNode("section", undefined, "activity-listing");
    const headingText = section === "freinet"
      ? "ΣΥΝΑΝΤΗΣΕΙΣ ΤΟΥ ΔΙΚΤΥΟΥ"
      : period === "previous" ? "ΠΡΟΗΓΟΥΜΕΝΕΣ ΔΡΑΣΕΙΣ" : "ΠΡΟΣΕΧΩΣ";
    const headingRow = createNode("div", undefined, "activity-listing-heading");
    const heading = createNode("h3", headingText);
    heading.id = `${period}-${section}`;
    listing.setAttribute("aria-labelledby", heading.id);
    const viewport = createNode("div", undefined, "activity-carousel");
    grid = createNode("div", undefined, "activity-cards");
    viewport.append(grid);
    const next = createNode("button", "→", "activity-carousel-next");
    next.type = "button";
    next.setAttribute("aria-label", `Επόμενες κάρτες: ${headingText.toLocaleLowerCase("el-GR")}`);
    const showAll = createNode("button", "Δείτε όλες", "activity-show-all");
    showAll.type = "button";
    showAll.setAttribute("aria-expanded", "false");
    const updateNext = () => {
      const expanded = listing.classList.contains("is-expanded");
      next.hidden = expanded || viewport.scrollWidth <= viewport.clientWidth + 1;
      next.disabled = Math.ceil(viewport.scrollLeft + viewport.clientWidth) >= viewport.scrollWidth - 1;
      showAll.hidden = grid.children.length < 2;
    };
    next.addEventListener("click", () => {
      viewport.scrollBy({
        left: viewport.clientWidth,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    viewport.addEventListener("scroll", updateNext, { passive: true });
    grid.addEventListener("cardschange", () => requestAnimationFrame(updateNext));
    showAll.addEventListener("click", () => {
      const expanded = listing.classList.toggle("is-expanded");
      showAll.setAttribute("aria-expanded", String(expanded));
      showAll.textContent = expanded ? "Σύμπτυξη" : "Δείτε όλες";
      if (!expanded) viewport.scrollTo({ left: 0, behavior: "auto" });
      requestAnimationFrame(updateNext);
    });
    new ResizeObserver(updateNext).observe(viewport);
    const actions = createNode("div", undefined, "activity-listing-actions");
    actions.append(showAll, next);
    headingRow.append(heading, actions);
    listing.append(headingRow, viewport);
    document.querySelector(`#${section}`).append(listing);
    activityGrids.set(key, grid);
    requestAnimationFrame(updateNext);
    return grid;
  }

  for (const section of activitySections) {
    cardGrid(section, "upcoming");
    cardGrid(section, "previous");
  }
  for (const post of [...content.posts].sort((a, b) => b.date.localeCompare(a.date))) {
    if (cardSections.has(post.section)) {
      const period = activitySections.has(post.section)
        ? post.activity_period
        : "all";
      const grid = cardGrid(post.section, period);
      const card = createActivityCard(post, activityUrl(post.id), post.section === "freinet" ? "✳" : "Ξ");
      if (post.event_date) card.dataset.activityDate = post.event_date;
      const meta = createNode("div", undefined, "activity-card-meta");
      if (ageRangeSections.has(post.section) && post.age_range?.trim()) {
        meta.append(createNode("span", post.age_range.trim()));
      }
      if (post.event_date) {
        const eventDate = createNode("time", new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(post.event_date)));
        eventDate.dateTime = post.event_date;
        meta.append(eventDate);
      }
      if (meta.children.length) card.prepend(meta);
      grid.append(card);
      sortActivityGrid(grid, period === "upcoming");
      grid.dispatchEvent(new Event("cardschange"));
      continue;
    }
    const article = document.createElement("article");
    const announcement = post.section === "nea";
    article.className = announcement ? "published-post announcement-card" : "published-post";
    const title = document.createElement("h3");
    title.textContent = post.title;
    if (post.event_date) {
      const time = document.createElement("time");
      time.dateTime = post.event_date;
      time.textContent = new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(post.event_date));
      if (announcement) article.append(title, time);
      else article.append(time, title);
    } else {
      article.append(title);
    }
    const content = announcement ? createNode("div", undefined, "announcement-content") : article;
    if (post.image) {
      const image = document.createElement("img");
      image.src = safeImageUrl(post.image);
      image.alt = post.alt;
      image.className = "content-image";
      image.loading = "lazy";
      content.append(image);
    }
    const body = document.createElement("p");
    body.className = announcement ? "content-text announcement-body" : "content-text";
    body.textContent = post.body;
    if (announcement) {
      const copy = createNode("div", undefined, "announcement-copy");
      copy.append(body);
      if (post.body.length > 240) {
        body.classList.add("is-collapsed");
        const more = createNode("button", "ΔΙΑΒΑΣΤΕ ΠΕΡΙΣΣΟΤΕΡΑ →", "announcement-more");
        more.type = "button";
        more.setAttribute("aria-expanded", "false");
        more.addEventListener("click", () => {
          const expanded = more.getAttribute("aria-expanded") === "true";
          more.setAttribute("aria-expanded", String(!expanded));
          more.textContent = expanded ? "ΔΙΑΒΑΣΤΕ ΠΕΡΙΣΣΟΤΕΡΑ →" : "ΛΙΓΟΤΕΡΑ ↑";
          body.classList.toggle("is-collapsed", expanded);
        });
        copy.append(more);
      }
      content.append(copy);
      article.append(content);
    } else {
      article.append(body);
    }
    document.querySelector(`#${post.section} h2`).parentElement.append(article);
  }
  mountPreviousActivityArchive(activityGrids, content.activity_archive_overrides);
  renderActivityDetail(content.posts, content.activity_archive_overrides);
  observeScrollReveals();
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

observeScrollReveals();
if (activePage === "stigmes-draseon") mountBlogArchive(observeScrollReveals);
