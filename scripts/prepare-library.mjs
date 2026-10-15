import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function normalizeTitle(title) {
  return title.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("el").replace(/ς/g, "σ").replace(/[^\p{L}\p{N}]/gu, "");
}

function identity(sheet, row) {
  const hex = createHash("sha256").update(`xenopouleio-library-2024:${sheet}:${row}`).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bibliographic(record) {
  const keys = {
    title: "title", author: "author", publisher: "publisher", year: "publication_year",
    place: "publication_place", pages: "page_count", number: "catalog_number", code: "classification_code",
  };
  return Object.fromEntries(Object.entries(keys).map(([from, to]) => [to, String(record[from] ?? "").trim()]));
}

export function prepareCatalog(sheets) {
  const main = sheets.find(sheet => sheet.name === "Φύλλο1");
  if (!main?.records.length) throw new Error("Missing main catalog.");
  const titles = new Map();
  const books = main.records.map(record => {
    const book = {
      id: identity(main.name, record.row), ...bibliographic(record),
      status: /καταστρ|ακυρο/.test(normalizeTitle(`${record.title} ${record.code ?? ""}`)) ? "unavailable" : "unverified",
      source_sheet: main.name, source_row: record.row,
    };
    if (!book.title) throw new Error(`Missing title at ${main.name}:${record.row}`);
    const key = normalizeTitle(book.title);
    if (!titles.has(key)) titles.set(key, []);
    titles.get(key).push(book.id);
    return book;
  });
  const review = sheets.filter(sheet => sheet !== main).flatMap(sheet => sheet.records.map(record => {
    const matches = titles.get(normalizeTitle(record.title)) || [];
    return {
      id: identity(sheet.name, record.row), ...bibliographic(record),
      source_sheet: sheet.name, source_row: record.row,
      decision: matches.length ? "reference" : "pending",
      book_id: matches.length === 1 ? matches[0] : null,
    };
  }));
  const ids = [...books, ...review].map(row => row.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate source rows.");
  return { books, review };
}

export function stagingTsv({ books, review }) {
  return "kind\tpayload\r\n" + [
    ...books.map(payload => ["main", payload]),
    ...review.map(payload => ["helper", payload]),
  ].map(([kind, payload]) => `${kind}\t${JSON.stringify(payload)}`).join("\r\n") + "\r\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw new Error("Usage: node scripts\\prepare-library.mjs sanitized-bibliographic.json output.tsv");
  const catalog = prepareCatalog(JSON.parse(readFileSync(input, "utf8")));
  writeFileSync(output, stagingTsv(catalog), "utf8");
  console.log(JSON.stringify({
    main: catalog.books.length, helper: catalog.review.length,
    pending: catalog.review.filter(row => row.decision === "pending").length,
    unavailable: catalog.books.filter(row => row.status === "unavailable").length,
    sheets: Object.fromEntries([...new Set(catalog.review.map(row => row.source_sheet))].map(name => [name, catalog.review.filter(row => row.source_sheet === name).length])),
  }, null, 2));
}
