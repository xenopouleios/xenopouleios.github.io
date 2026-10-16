import test from "node:test";
import assert from "node:assert/strict";
import { applicationValues, lendingError, approvalEmail } from "./lending-data.js";

const valid = { full_name: "Synthetic Member", guardian_name: "", is_minor: false, phone: "1234567890", email: "TEST@example.test", address: "Synthetic address", identity_number: "TEST-123" };

test("application validation includes only requested private fields", () => {
  const value = applicationValues({ ...valid, member_code: "1", role: "admin", auth_user_id: "fake" });
  assert.equal(value.email, "test@example.test");
  assert.equal(Object.hasOwn(value, "role"), false);
  assert.equal(Object.hasOwn(value, "member_code"), false);
  assert.equal(Object.hasOwn(value, "auth_user_id"), false);
});
test("minor applications need guardian names and all contact fields are required", () => {
  assert.throws(() => applicationValues({ ...valid, is_minor: true }));
  assert.doesNotThrow(() => applicationValues({ ...valid, is_minor: true, guardian_name: "Synthetic Guardian" }));
  for (const key of ["full_name", "phone", "email", "address", "identity_number"]) {
    assert.throws(() => applicationValues({ ...valid, [key]: "" }));
  }
  assert.throws(() => applicationValues({ ...valid, email: "invalid" }));
  assert.throws(() => applicationValues({ ...valid, address: "a".repeat(501) }));
});
test("private lending errors never echo personal database details", () => {
  for (const code of ["42501", "40001", "23505", "23514", "23503", "54000", "22023", "unexpected"]) {
    assert.ok(!lendingError({ code, message: "PRIVATE-SENTINEL", details: "PRIVATE-SENTINEL" }).includes("PRIVATE-SENTINEL"));
  }
});
test("manual approval email includes registry number and personal activation instructions", () => {
  const email = approvalEmail({ full_name: "Synthetic", member_code: "4091", activation_url: "https://example.test/activate" });
  assert.ok(email.includes("4091"));
  assert.ok(email.includes("https://example.test/activate"));
  assert.ok(email.includes("μίας χρήσης"));
  assert.ok(email.includes("δεν είναι κωδικός"));
});
