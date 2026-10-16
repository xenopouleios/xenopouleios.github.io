import { createHash } from "node:crypto";
import { memberValues, needsMemberReview } from "../members-data.js";

export function prepareMembers(sheets) {
  const populated = sheets.filter(sheet => sheet.records?.length);
  if (populated.length !== 1) throw new Error("Expected one populated member worksheet.");
  const sheet = populated[0];
  const [header, ...rows] = sheet.records;
  if (header.cells.A !== "ΚωδΜέλους" || header.cells.B !== "Επώνυμο" || header.cells.C !== "Όνομα") {
    throw new Error("Unexpected member columns; manual mapping required.");
  }
  const codes = new Set();
  const sources = new Set();
  const records = rows.map(record => {
    if (Object.keys(record.cells).some(key => !["A", "B", "C"].includes(key))) {
      throw new Error("Unexpected member column; import stopped.");
    }
    const values = memberValues({
      member_code: record.cells.A, surname: record.cells.B || "", given_name: record.cells.C || "",
    });
    if (!Number.isInteger(record.row) || record.row <= header.row || sources.has(record.row) || codes.has(values.member_code)) {
      throw new Error("Duplicate member code or invalid source row; import stopped.");
    }
    codes.add(values.member_code);
    sources.add(record.row);
    const hex = createHash("sha256").update(`xenopouleio-members:${sheet.name}:${record.row}`).digest("hex").slice(0, 32);
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return { id, ...values, source_sheet: sheet.name, source_row: record.row };
  });
  return { records, reviewCount: records.filter(needsMemberReview).length };
}

export function membersChecksum(records) {
  const text = [...records].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(record => ["id", "member_code", "surname", "given_name", "source_sheet", "source_row"].map(key => record[key]).join("\x1f")).join("\x1e");
  return createHash("md5").update(text).digest("hex");
}
