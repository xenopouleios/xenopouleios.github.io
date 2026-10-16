import test from "node:test";
import assert from "node:assert/strict";
import { memberValues, needsMemberReview, memberError } from "./members-data.js";
import { prepareMembers, membersChecksum } from "./scripts/prepare-members.mjs";

const source = records => [{ name: "Φύλλο1", records: [
  { row: 1, cells: { A: "ΚωδΜέλους", B: "Επώνυμο", C: "Όνομα" } }, ...records,
] }, { name: "Φύλλο2", records: [] }];

test("member fields preserve text and leading zero codes without copying unrelated data", () => {
  assert.deepEqual(memberValues({ member_code: " 001 ", surname: " Δοκιμή ", given_name: "", password: "not copied" }), {
    member_code: "001", surname: "Δοκιμή", given_name: "",
  });
  for (const code of ["", " ", "1.5", "-1", "1e3", "1 2", "α", "1".repeat(21)]) {
    assert.throws(() => memberValues({ member_code: code }));
  }
  assert.throws(() => memberValues({ member_code: "1", surname: 123 }));
  assert.doesNotThrow(() => memberValues({ member_code: "1", surname: "α".repeat(300) }));
  assert.throws(() => memberValues({ member_code: "1", given_name: "α".repeat(301) }));
});

test("incomplete and numeric name fields are flagged, never silently corrected", () => {
  assert.equal(needsMemberReview(memberValues({ member_code: "1" })), true);
  assert.equal(needsMemberReview(memberValues({ member_code: "2", surname: "Δοκιμή", given_name: "2000" })), true);
  assert.equal(needsMemberReview(memberValues({ member_code: "3", surname: "Δοκιμή" })), false);
});

test("member import keeps code-only rows, gaps, combined names, numeric fields and provenance", () => {
  const sheets = source([
    { row: 2, cells: { A: "1", B: "Σύνθετο όνομα δοκιμής" } },
    { row: 3, cells: { A: "3" } },
    { row: 4, cells: { A: "4", B: "Δοκιμή", C: "2000" } },
  ]);
  const result = prepareMembers(sheets);
  assert.equal(result.records.length, 3);
  assert.equal(result.reviewCount, 2);
  assert.equal(result.records[0].surname, "Σύνθετο όνομα δοκιμής");
  assert.equal(result.records[1].surname, "");
  assert.equal(result.records[2].given_name, "2000");
  assert.equal(result.records[2].source_row, 4);
  assert.deepEqual(prepareMembers(sheets), result);
  assert.equal(membersChecksum([...result.records].reverse()), membersChecksum(result.records));
  assert.notEqual(membersChecksum(result.records), membersChecksum(result.records.slice(1)));
});

test("member import rejects changed headers, unknown columns and duplicate codes or source rows", () => {
  assert.throws(() => prepareMembers([]));
  assert.throws(() => prepareMembers([{ name: "test", records: [{ row: 1, cells: {} }] }]));
  assert.throws(() => prepareMembers(source([{ row: 2, cells: { A: "1", D: "unexpected" } }])));
  assert.throws(() => prepareMembers(source([{ row: 2, cells: { A: "1" } }, { row: 3, cells: { A: "1" } }])));
  assert.throws(() => prepareMembers(source([{ row: 2, cells: { A: "1" } }, { row: 2, cells: { A: "2" } }])));
});

test("member errors never echo database details containing personal data", () => {
  for (const code of ["23505", "40001", "42501", "unknown"]) {
    assert.equal(memberError({ code, message: "PRIVATE SENTINEL", details: "PRIVATE SENTINEL" }).includes("PRIVATE SENTINEL"), false);
  }
});
