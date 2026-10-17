import test from "node:test";
import assert from "node:assert/strict";
import { createUndoHistory } from "./admin-history.js";

test("undo history restores content and its previous publication state", () => {
  const history = createUndoHistory();
  const content = { fields: { title: "Αρχικό" }, images: {}, posts: [] };
  history.remember(content, false, "field-title");
  content.fields.title = "Νέο";

  const entry = history.undo();
  assert.equal(entry.value.fields.title, "Αρχικό");
  assert.equal(entry.dirty, false);
  assert.equal(history.canUndo, false);
});

test("continuous typing in one field is one undo step", () => {
  const history = createUndoHistory();
  const content = { fields: { title: "" } };
  history.remember(content, false, "field-title");
  content.fields.title = "Α";
  history.remember(content, true, "field-title");
  content.fields.title = "ΑΒ";

  assert.equal(history.undo().value.fields.title, "");
  history.remember(content, true, "field-title");
  content.fields.title = "ΑΒΓ";
  assert.equal(history.undo().value.fields.title, "ΑΒ");
});

test("undo history keeps only the configured number of changes", () => {
  const history = createUndoHistory(2);
  history.remember({ value: 1 }, true, "one");
  history.remember({ value: 2 }, true, "two");
  history.remember({ value: 3 }, true, "three");

  assert.equal(history.undo().value.value, 3);
  assert.equal(history.undo().value.value, 2);
  assert.equal(history.undo(), null);
});
