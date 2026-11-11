// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
/** Shared browser/server allowlist. Never dispatch arbitrary model-supplied editor actions. */
export const AGENT_LIMITS = Object.freeze({ maxGenerations: 4, maxToolCalls: 1, maxEditsPerBatch: 12, maxEditsPerRun: 24, contextBytes: 96000, bodyBytes: 128000, toolArgumentsBytes: 32000, toolResultBytes: 24000, runTimeoutMs: 600000 });
const string = (maxLength, minLength = 0) => ({ type: 'string', minLength, maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const enumeration = (...values) => ({ type: 'string', enum: values });
const object = (properties, required = Object.keys(properties), extra = {}) => ({ type: 'object', properties, required, additionalProperties: false, ...extra });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const target = string(128, 1), position = enumeration('before', 'after');
const edit = (type, properties, required = Object.keys(properties)) => object({ type: enumeration(type), ...properties }, ['type', ...required]);
const edits = [
  edit('replace_text', { targetId: target, newText: string(8000) }),
  edit('insert_text', { targetId: target, position, text: string(8000, 1) }),
  edit('format_text', { targetId: target, format: object({ bold: { type: 'boolean' }, italic: { type: 'boolean' }, underline: { type: 'boolean' }, fontSize: { type: 'number', minimum: 6, maximum: 96 } }, [], { minProperties: 1 }) }),
  edit('format_paragraph', { targetId: target, format: object({ alignment: enumeration('left', 'center', 'right', 'justify'), headingLevel: integer(0, 6) }, [], { minProperties: 1 }) }),
  edit('create_table', { targetId: target, position, rows: array(array(string(2000), 1, 6), 1, 10), headerRow: { type: 'boolean' } }, ['targetId', 'position', 'rows']),
  edit('set_table_cell', { targetId: target, text: { ...string(2000), pattern: '^[^\\r\\n]*$' } }),
];
export const AGENT_TOOLS = [
  { type: 'function', function: { name: 'doc_find_text', description: 'Find literal substring matches in the current document when you only need to edit part of a paragraph. Not needed when replacing, formatting, or inserting whole paragraphs, because context.targets already provides targetIds for every paragraph and document boundary. Use returned targets only; do not invent IDs.', parameters: object({ queries: array(object({ text: string(2000, 1), matchCase: { type: 'boolean' } }, ['text']), 1, 8) }) } },
  { type: 'function', function: { name: 'doc_read_tables', description: 'Read bounded existing tables by zero-based tableIndex and obtain opaque cell targetIds. Use those IDs with set_table_cell.', parameters: object({ tables: array(object({ tableIndex: integer(0, 10000), maxRows: integer(1, 20), maxCols: integer(1, 10) }, ['tableIndex']), 1, 3) }) } },
  { type: 'function', function: { name: 'doc_apply_edits', description: 'Apply up to 12 edits to opaque targets from context.targets (paragraph/boundary) or prior tool results, with actual readback. Prefer batching all paragraph replacements, insertions, and formatting into a single call using distinct targetIds from context.targets. Each edit in a batch must use a distinct, non-overlapping target. To replace and format the same text, apply replacement first, then use a fresh target from the refreshed context.targets in the next call. Empty newText deletes. Insert text may contain explicit newlines. Format and table changes are limited to the listed properties. Results explicitly distinguish verified, partial and unknown changes.', parameters: object({ edits: array({ oneOf: edits }, 1, AGENT_LIMITS.maxEditsPerBatch) }) } },
];
function matches(value, schema) {
  if (schema.oneOf) return schema.oneOf.filter(s => matches(value, s)).length === 1;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'string') return typeof value === 'string' && !value.includes('\0') && value.length >= (schema.minLength ?? 0) && (schema.maxLength === undefined || value.length <= schema.maxLength) && (!schema.pattern || new RegExp(schema.pattern).test(value));
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'number' || schema.type === 'integer') return typeof value === 'number' && Number.isFinite(value) && (schema.type !== 'integer' || Number.isInteger(value)) && value >= schema.minimum && value <= schema.maximum;
  if (schema.type === 'array') return Array.isArray(value) && value.length >= schema.minItems && value.length <= schema.maxItems && value.every(v => matches(v, schema.items));
  if (schema.type === 'object') return !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length >= (schema.minProperties ?? 0) && schema.required.every(k => Object.hasOwn(value, k)) && Object.keys(value).every(k => Object.hasOwn(schema.properties, k) && matches(value[k], schema.properties[k]));
  return false;
}
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
export function validateToolCall(name, args) {
  const tool = AGENT_TOOLS.find(t => t.function.name === name);
  if (!tool || !matches(args, tool.function.parameters) || bytes(args) > AGENT_LIMITS.toolArgumentsBytes) throw new Error('invalid_tool_call');
  if (name === 'doc_apply_edits' && args.edits.some(e => e.type === 'create_table' && e.rows.some(row => row.length !== e.rows[0].length))) throw new Error('invalid_tool_call');
  return JSON.parse(JSON.stringify(args));
}
const contextSchema = object({ runId: string(128, 1), targets: array(object({ targetId: target, kind: enumeration('paragraph', 'boundary'), text: string(8000), paragraphIndex: integer(0, 1000000), position: enumeration('start', 'end') }, ['targetId', 'kind', 'text']), 0, 128) });
export function validateAgentContext(context) {
  if (!matches(context, contextSchema) || bytes(context) > AGENT_LIMITS.toolResultBytes) throw new Error('invalid_agent_context');
  if (new Set(context.targets.map(t => t.targetId)).size !== context.targets.length) throw new Error('invalid_agent_context');
  return JSON.parse(JSON.stringify(context));
}
function boundedData(value, depth = 0) {
  if (depth > 10) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= AGENT_LIMITS.toolResultBytes && !value.includes('\0');
  if (Array.isArray(value)) return value.length <= 1000 && value.every(v => boundedData(v, depth + 1));
  return !!value && typeof value === 'object' && Object.keys(value).length <= 1000 && Object.entries(value).every(([k, v]) => !['__proto__', 'constructor', 'prototype'].includes(k) && boundedData(v, depth + 1));
}
export function validateToolResult(value) {
  const fields = ['ok', 'tool', 'runId', 'document', 'revision', 'saved', 'partial', 'verification', 'result', 'error'];
  const required = fields.filter(k => k !== 'error');
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !fields.includes(k)) || required.some(k => !Object.hasOwn(value, k)) || typeof value.ok !== 'boolean' || typeof value.saved !== 'boolean' || typeof value.partial !== 'boolean' || !AGENT_TOOLS.some(t => t.function.name === value.tool) || !matches(value.runId, string(128, 1)) || !matches(value.revision, integer(0, Number.MAX_SAFE_INTEGER)) || !matches(value.document, object({ id: string(128, 1), name: string(255, 1), version: integer(0, Number.MAX_SAFE_INTEGER) })) || !['verified', 'failed', 'unknown', 'not_applicable'].includes(value.verification) || !value.result || typeof value.result !== 'object' || Array.isArray(value.result) || !boundedData(value.result) || bytes(value) > AGENT_LIMITS.toolResultBytes) throw new Error('invalid_tool_result');
  if (value.error !== undefined && (!matches(value.error, object({ code: string(100, 1), message: string(1000), outcomeUnknown: { type: 'boolean' }, retryable: { type: 'boolean' } })) || value.error.retryable !== false)) throw new Error('invalid_tool_result');
  if ((value.ok && (value.partial || value.error || value.verification !== 'verified')) || (!value.ok && !value.error)) throw new Error('invalid_tool_result');
  return JSON.parse(JSON.stringify(value));
}
