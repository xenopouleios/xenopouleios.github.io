import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sanitizeHtml from "sanitize-html";

const feedUrl = "https://filoixenopouliou.blogspot.com/feeds/posts/default";
const pageSize = 10;
const maxPosts = 1000;
const archiveChunkSize = 6;

function classifyAudience(title) {
  const normalizedTitle = title.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("el-GR");
  const childTerms = /παιδ|σχολ|νηπιαγωγ|μαθητ|εφηβ|παραμυθ|βρεφ/;
  const adultTerms = /ενηλικ|εκπαιδευτικ|γονε|γονι|σεμιναρ|επιμορφ|ημεριδ|συνεδρ|λεσχη (?:βιβλιου|αναγνωσης)|πρωτ(?:ες|ων) βοηθει|εθελοντ|γενικ[ηης]+ συνελευ|εκλογ|καθηγητ|συλλογ/;
  if (childTerms.test(normalizedTitle)) return "children";
  return adultTerms.test(normalizedTitle) ? "adults" : "children";
}

function eventDateFromTitle(title, publishedDate) {
  const matches = [...title.matchAll(/(?:^|\D)(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?!\d)/g)];
  const match = matches.at(-1);
  if (!match) return publishedDate;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const eventDate = `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return Number.isFinite(Date.parse(eventDate)) && new Date(eventDate).toISOString().slice(0, 10) === eventDate
    ? eventDate
    : publishedDate;
}

function cleanContent(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img", "figure", "figcaption", "h1", "h2", "h3", "h4",
      "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading", "decoding"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan", "scope"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    allowedSchemesAppliedToAttributes: ["href", "src"],
    allowProtocolRelative: true,
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          href: attributes.href || "",
          title: attributes.title || "",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      img: (_tagName, attributes) => ({
        tagName: "img",
        attribs: {
          src: attributes.src?.startsWith("//") ? `https:${attributes.src}` : attributes.src || "",
          alt: attributes.alt || "",
          width: attributes.width || "",
          height: attributes.height || "",
          loading: "lazy",
          decoding: "async",
        },
      }),
    },
  });
}

function postFromEntry(entry) {
  const id = entry.id?.$t?.split(".post-").pop();
  const originalUrl = entry.link?.find(link => link.rel === "alternate")?.href;
  const published = entry.published?.$t;
  if (!id || !published || !originalUrl) throw new Error("Το Blogger επέστρεψε ανάρτηση με ελλιπή στοιχεία.");
  const rawContent = entry.content?.$t || entry.summary?.$t || "";
  const plainText = sanitizeHtml(rawContent, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
  const content = cleanContent(rawContent);
  const image = content.match(/<img[^>]+src="([^"]+)"/i)?.[1]?.replaceAll("&amp;", "&") || "";
  const title = entry.title?.$t?.trim() || plainText.slice(0, 100) || `Δημοσίευση ${published.slice(0, 10)}`;
  const date = published.slice(0, 10);
  return {
    id,
    title,
    date,
    eventDate: eventDateFromTitle(title, date),
    content,
    summary: plainText.slice(0, 240),
    image,
    audience: classifyAudience(title),
    originalUrl,
  };
}

async function fetchFeedPage(startIndex) {
  const url = new URL(feedUrl);
  url.searchParams.set("alt", "json");
  url.searchParams.set("start-index", String(startIndex));
  url.searchParams.set("max-results", String(pageSize));
  const response = await fetch(url, {
    headers: { "User-Agent": "xenopouleio-blog-import/1.0" },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Αποτυχία λήψης Blogger feed (${response.status}).`);
  return response.json();
}

const posts = [];
let total = null;
for (let startIndex = 1; startIndex <= maxPosts; startIndex += pageSize) {
  const data = await fetchFeedPage(startIndex);
  const entries = data.feed?.entry || [];
  total ??= Number(data.feed?.["openSearch$totalResults"]?.$t);
  posts.push(...entries.map(postFromEntry));
  if (!entries.length || posts.length >= total) break;
}

if (!Number.isInteger(total) || total < 0 || total > maxPosts) throw new Error(`Μη αναμενόμενο πλήθος αναρτήσεων Blogger: ${total}`);
if (posts.length !== total) throw new Error(`Λήφθηκαν ${posts.length} από ${total} αναρτήσεις Blogger.`);

posts.sort((a, b) => b.date.localeCompare(a.date));
const outputDirectory = resolve(import.meta.dirname, "..", "public");
await mkdir(outputDirectory, { recursive: true });
const existingChunks = (await readdir(outputDirectory)).filter(name => /^blog-archive-\d+\.json$/.test(name));
await Promise.all(existingChunks.map(name => unlink(resolve(outputDirectory, name))));
const chunks = Array.from({ length: Math.ceil(posts.length / archiveChunkSize) }, (_, index) => posts.slice(index * archiveChunkSize, (index + 1) * archiveChunkSize));
await Promise.all(chunks.map((chunk, index) => writeFile(
  resolve(outputDirectory, `blog-archive-${index + 1}.json`),
  JSON.stringify({ posts: chunk }),
)));
await writeFile(resolve(outputDirectory, "blog-archive.json"), JSON.stringify({
  source: "https://filoixenopouliou.blogspot.com/",
  generatedAt: new Date().toISOString(),
  total,
  pageSize: archiveChunkSize,
  pages: chunks.length,
}));
for (const audience of ["children", "adults"]) {
  await writeFile(resolve(outputDirectory, `activity-archive-${audience}.json`), JSON.stringify({
    generatedAt: new Date().toISOString(),
    posts: posts.filter(post => post.audience === audience).map(({ id, title, date, eventDate, content, summary, image, originalUrl }) => ({ id, title, date, event_date: eventDate, content, summary, image, originalUrl })),
  }));
}
console.log(`Prepared ${posts.length} Blogger posts in ${chunks.length} pages.`);
