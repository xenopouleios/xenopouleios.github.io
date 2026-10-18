function validateArchive(archive) {
  if (!archive || !Number.isInteger(archive.total) || !Number.isInteger(archive.pageSize) || !Number.isInteger(archive.pages) || archive.pages !== Math.ceil(archive.total / archive.pageSize)) {
    throw new Error("Το αρχείο δημοσιεύσεων δεν είναι έγκυρο.");
  }
}

function validatePosts(posts) {
  if (!Array.isArray(posts)) throw new Error("Η σελίδα δημοσιεύσεων δεν είναι έγκυρη.");
  for (const post of posts) {
    if (!post || !["id", "title", "date", "content", "originalUrl"].every(key => typeof post[key] === "string")) {
      throw new Error("Μία δημοσίευση του αρχείου δεν είναι έγκυρη.");
    }
  }
}

function createPost(post) {
  const article = document.createElement("article");
  article.className = "blog-post announcement-card";
  const heading = document.createElement("h3");
  heading.textContent = post.title;
  const time = document.createElement("time");
  time.dateTime = post.date;
  time.textContent = new Intl.DateTimeFormat("el-GR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(post.date));
  article.append(heading, time);

  const layout = document.createElement("div");
  layout.className = "announcement-content";
  const content = document.createElement("div");
  content.className = "blog-post-content announcement-body is-collapsed";
  content.innerHTML = post.content;
  const firstImage = content.querySelector("img");
  if (firstImage) {
    const imageContainer = firstImage.closest("a");
    firstImage.className = "content-image";
    firstImage.removeAttribute("width");
    firstImage.removeAttribute("height");
    layout.append(firstImage);
    if (imageContainer && !imageContainer.textContent.trim() && !imageContainer.querySelector("img")) imageContainer.remove();
  }

  const copy = document.createElement("div");
  copy.className = "announcement-copy";
  copy.append(content);
  const source = document.createElement("a");
  source.className = "blog-post-source";
  source.href = post.originalUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "Αρχική δημοσίευση ↗";
  content.append(source);

  const more = document.createElement("button");
  more.className = "announcement-more";
  more.type = "button";
  more.setAttribute("aria-expanded", "false");
  more.textContent = "ΔΙΑΒΑΣΤΕ ΠΕΡΙΣΣΟΤΕΡΑ →";
  more.addEventListener("click", () => {
    const expanded = more.getAttribute("aria-expanded") === "true";
    more.setAttribute("aria-expanded", String(!expanded));
    more.textContent = expanded ? "ΔΙΑΒΑΣΤΕ ΠΕΡΙΣΣΟΤΕΡΑ →" : "ΛΙΓΟΤΕΡΑ ↑";
    content.classList.toggle("is-collapsed", expanded);
  });
  copy.append(more);
  layout.append(copy);
  article.append(layout);
  return article;
}

export async function mountBlogArchive(onRender) {
  const root = document.querySelector(".blog-archive-mount");
  if (!root) return;
  root.textContent = "Φόρτωση δημοσιεύσεων…";
  try {
    const response = await fetch(new URL("./blog-archive.json", location.href));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive = await response.json();
    validateArchive(archive);
    const list = document.createElement("div");
    list.className = "blog-posts";
    const status = document.createElement("p");
    status.className = "blog-archive-status";
    const more = document.createElement("button");
    more.className = "blog-load-more";
    more.type = "button";
    more.textContent = "Φόρτωση παλαιότερων δημοσιεύσεων";
    let rendered = 0;
    let nextPage = 1;
    const renderPage = async () => {
      more.disabled = true;
      try {
        const pageResponse = await fetch(new URL(`./blog-archive-${nextPage}.json`, location.href));
        if (!pageResponse.ok) throw new Error(`HTTP ${pageResponse.status}`);
        const page = await pageResponse.json();
        validatePosts(page.posts);
        if (!page.posts.length || page.posts.length > archive.pageSize) throw new Error("Μη αναμενόμενο πλήθος δημοσιεύσεων.");
        page.posts.forEach(post => list.append(createPost(post)));
        rendered += page.posts.length;
        nextPage += 1;
        status.textContent = `Εμφανίζονται ${rendered} από ${archive.total} δημοσιεύσεις.`;
        more.hidden = nextPage > archive.pages;
        onRender?.();
      } catch (error) {
        console.error("Blog archive page loading failed", error);
        status.textContent = "Δεν φορτώθηκαν οι επόμενες δημοσιεύσεις. Δοκιμάστε ξανά.";
        status.classList.add("is-error");
      } finally {
        more.disabled = false;
      }
    };
    more.addEventListener("click", renderPage);
    root.replaceChildren(list, status, more);
    await renderPage();
  } catch (error) {
    console.error("Blog archive loading failed", error);
    root.textContent = "Δεν ήταν δυνατή η φόρτωση των παλιότερων δράσεων. Δοκιμάστε ξανά σε λίγο.";
    root.classList.add("is-error");
  }
}
