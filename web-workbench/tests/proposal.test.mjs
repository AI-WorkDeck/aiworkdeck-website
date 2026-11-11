// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

import test from "node:test";
import assert from "node:assert/strict";
import { countLiteralMatches, validateProposal } from "../src/proposal.js";

const context = { fileId: "f1", version: 3, text: "alpha target omega", selectionText: "target" };
const proposal = { fileId: "f1", version: 3, original: "target", replacement: "updated" };

test("counts overlapping literal matches", () => {
  assert.equal(countLiteralMatches("a.b a.b", "a.b"), 2);
  assert.equal(countLiteralMatches("aaaa", "aa"), 3);
  assert.equal(countLiteralMatches("aaa", "aa"), 2);
  assert.equal(countLiteralMatches("abc", ""), 0);
});

test("accepts a current proposal matching the captured selection exactly", () => {
  assert.deepEqual(validateProposal(proposal, context), { ok: true, reason: null });
});

test("rejects stale file identity or version", () => {
  assert.equal(validateProposal({ ...proposal, version: 2 }, context).reason, "VERSION_MISMATCH");
  assert.equal(validateProposal({ ...proposal, fileId: "f2" }, context).reason, "VERSION_MISMATCH");
});

test("rejects selection drift, empty originals, and non-unique text", () => {
  assert.equal(validateProposal({ ...proposal, original: "other" }, context).reason, "SELECTION_MISMATCH");
  assert.equal(validateProposal({ ...proposal, original: "  " }, { ...context, selectionText: "  ", text: "  " }).reason, "EMPTY_ORIGINAL");
  assert.equal(validateProposal(proposal, { ...context, text: "target and target" }).reason, "ORIGINAL_NOT_UNIQUE");
});

test("rejects invalid replacement types, blanks, and oversized text", () => {
  assert.equal(validateProposal({ ...proposal, replacement: new String("x") }, context).reason, "INVALID_REPLACEMENT");
  assert.equal(validateProposal({ ...proposal, replacement: "  " }, context).reason, "INVALID_REPLACEMENT");
  assert.equal(validateProposal({ ...proposal, replacement: "x".repeat(50001) }, context).reason, "INVALID_REPLACEMENT");
});

test("rejects non-object inputs", () => {
  assert.equal(validateProposal(null, context).reason, "INVALID_PROPOSAL");
});
