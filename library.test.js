import test from "node:test";
import assert from "node:assert/strict";
import { bookFields, fieldLimits, bookValues } from "./library-data.js";
import { normalizeTitle, prepareCatalog, stagingTsv } from "./scripts/prepare-library.mjs";

test("book form validates exact field limits and exposes bibliographic fields only", () => {
  assert.throws(() => bookValues({ title: " " }));
  assert.throws(() => bookValues({ title: "Βιβλίο", status: "unknown" }));
  assert.equal(bookValues({ title: "Βιβλίο", status: "available" }).status, "available");
  assert.equal(bookValues({ title: "Βιβλίο", status: "borrowed" }).status, "borrowed");
  bookFields.forEach(([key], index) => {
    assert.doesNotThrow(() => bookValues({ title: "Τίτλος", [key]: "α".repeat(fieldLimits[index]) }));
    assert.throws(() => bookValues({ title: "Τίτλος", [key]: "α".repeat(fieldLimits[index] + 1) }));
  });
  const result = bookValues({ title: " Βιβλίο ", donor: "private", source_row: 15 });
  assert.equal(result.title, "Βιβλίο");
  assert.equal(result.status, "unverified");
  assert.equal(Object.hasOwn(result, "donor"), false);
  assert.equal(Object.hasOwn(result, "source_row"), false);
});

test("Greek title comparison ignores accents, case, punctuation and final sigma", () => {
  assert.equal(normalizeTitle("Ο Κόσμος!"), normalizeTitle("ο κοσμοσ"));
  assert.notEqual(normalizeTitle("Το γαλάζιο φως"), normalizeTitle("Το γαλάζιο κουνελάκι"));
});

test("import preserves copies, blank catalog numbers, source identity and withdrawal flags", () => {
  const sheets = [
    { name: "Φύλλο1", records: [
      { row: 2, title: "Τίτλος", number: "1", code: "200", donor: "private" },
      { row: 3, title: "Τίτλος", number: "1", code: "200" },
      { row: 4, title: "Βιβλίο-ΚΑΤΑΣΤΡΑΦΗΚΕ", number: "" },
      { row: 5, title: "Άλλο", code: "ΑΚΥΡΟ" },
    ] },
    { name: "Φύλλο4", records: [
      { row: 2, title: "τιτλος", author: "wrong shifted author" },
      { row: 3, title: "Διαφορετικό", author: "Unknown" },
    ] },
  ];
  const result = prepareCatalog(sheets);
  assert.equal(result.books.length, 4);
  assert.equal(result.review.length, 2);
  assert.equal(result.review[0].decision, "reference");
  assert.equal(result.review[0].book_id, null);
  assert.equal(result.review[1].decision, "pending");
  assert.equal(result.books[2].catalog_number, "");
  assert.equal(result.books[2].status, "unavailable");
  assert.equal(result.books[3].status, "unavailable");
  assert.equal(new Set(result.books.map(book => book.id)).size, 4);
  assert.deepEqual(prepareCatalog(sheets), result);
  assert.equal(stagingTsv(result).includes("private"), false);
  assert.throws(() => prepareCatalog([]));
  assert.throws(() => prepareCatalog([{ name: "Φύλλο1", records: [{ row: 2, title: "A" }, { row: 2, title: "B" }] }]));
});

test("TSV staging round-trips JSON, quotations, tabs and newlines", () => {
  const result = prepareCatalog([{ name: "Φύλλο1", records: [{ row: 2, title: 'Το "βιβλίο"\nμε συνέχεια' }] }]);
  const tsv = stagingTsv(result);
  assert.ok(tsv.startsWith("kind\tpayload\r\nmain\t"));
  assert.deepEqual(JSON.parse(tsv.split("\r\n")[1].split("\t")[1]), result.books[0]);
});
