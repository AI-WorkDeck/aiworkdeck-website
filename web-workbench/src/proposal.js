// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

export function countLiteralMatches(text, needle) {
  if (typeof text !== "string" || typeof needle !== "string" || needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while ((from = text.indexOf(needle, from)) !== -1) {
    count += 1;
    from += 1;
  }
  return count;
}

export function validateProposal(proposal, { fileId, version, text, selectionText } = {}) {
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) return { ok: false, reason: "INVALID_PROPOSAL" };
  if (typeof fileId !== "string" || !fileId || !Number.isInteger(version) || typeof text !== "string" || typeof selectionText !== "string") {
    return { ok: false, reason: "INVALID_CONTEXT" };
  }
  if (typeof proposal.fileId !== "string" || proposal.fileId !== fileId || !Number.isInteger(proposal.version) || proposal.version !== version) {
    return { ok: false, reason: "VERSION_MISMATCH" };
  }
  if (typeof proposal.original !== "string" || proposal.original !== selectionText) return { ok: false, reason: "SELECTION_MISMATCH" };
  if (!proposal.original.trim()) return { ok: false, reason: "EMPTY_ORIGINAL" };
  if (countLiteralMatches(text, proposal.original) !== 1) return { ok: false, reason: "ORIGINAL_NOT_UNIQUE" };
  if (typeof proposal.replacement !== "string" || !proposal.replacement.trim() || proposal.replacement.length > 50000) {
    return { ok: false, reason: "INVALID_REPLACEMENT" };
  }
  return { ok: true, reason: null };
}
