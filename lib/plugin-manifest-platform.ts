// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

/** Static admission checks shared by all marketplace submissions. Network/DNS and
 * current-user authorization remain host checks; this function never calls a service. */
type Obj = Record<string, unknown>;
function object(value: unknown, at: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at}: expected object`);
  return value as Obj;
}
function list(value: unknown, at: string, max: number): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new Error(`${at}: expected array, maximum ${max}`);
  return value;
}
function string(value: unknown, at: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${at}: invalid string`);
  return value;
}
function match(value: unknown, pattern: RegExp, at: string): string {
  const text = string(value, at);
  if (!pattern.test(text)) throw new Error(`${at}: invalid identifier/path`);
  return text;
}
function oneOf(value: unknown, choices: readonly string[], at: string): string {
  const text = string(value, at);
  if (!choices.includes(text)) throw new Error(`${at}: expected ${choices.join('/')}`);
  return text;
}
function fields(value: Obj, allowed: readonly string[], at: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${at}.${key}: unknown declaration field`);
}
function unique(values: string[], at: string) {
  if (new Set(values).size !== values.length) throw new Error(`${at}: duplicate declaration`);
}
function https(value: unknown, at: string, originOnly = false): URL {
  const raw = string(value, at, 2048);
  if (/\s/.test(raw)) throw new Error(`${at}: URL must not contain whitespace`);
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${at}: invalid HTTPS URL`); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (originOnly && url.search) ||
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') ||
      (originOnly && url.pathname !== '/')) throw new Error(`${at}: public HTTPS ${originOnly ? 'origin' : 'URL'} required`);
  return url;
}
function entry(value: unknown, at: string, files: ReadonlyMap<string, Buffer>) {
  const rel = string(value, at, 255);
  if (!rel.startsWith('web/') || /[\\%?#:\x00-\x1f\x7f]/.test(rel) ||
      rel.split('/').some(part => !part || part === '.' || part === '..') || !files.has(rel)) {
    throw new Error(`${at}: existing regular file under web/ required`);
  }
}
const VIEW_ID = /^[a-z][a-z0-9-]{0,49}$/;
const OP_ID = /^[a-zA-Z][a-zA-Z0-9._-]{0,63}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PERMISSIONS = ['file_read', 'file_write', 'network', 'editor', 'ai', 'im', 'notifications', 'lawfirm', 'speech', 'tasks', 'clipboard'];

/** Exact reviewed MCP schema subset supported by the host, not arbitrary JSON Schema. */
export function validateMcpInputSchema(value: unknown, at = 'inputSchema', depth = 0): void {
  const schema = object(value, at);
  if (depth > 8 || Object.keys(schema).length > 8) throw new Error(`${at}: schema complexity limit`);
  const type = oneOf(schema.type, ['object', 'array', 'string', 'boolean', 'integer', 'number'], `${at}.type`);
  if (depth === 0 && type !== 'object') throw new Error(`${at}: root must be object`);
  const allowed = ['type', 'description', 'title', ...(type === 'object' ? ['properties', 'required', 'additionalProperties'] : type === 'array' ? ['items'] : type === 'string' ? ['enum'] : [])];
  for (const key of Object.keys(schema)) if (!allowed.includes(key)) throw new Error(`${at}.${key}: unsupported schema keyword`);
  for (const key of ['description', 'title']) if (schema[key] !== undefined) string(schema[key], `${at}.${key}`);
  if (type === 'object') {
    const properties = schema.properties === undefined ? {} : object(schema.properties, `${at}.properties`);
    if (Object.keys(properties).length > 64) throw new Error(`${at}: too many properties`);
    for (const [key, nested] of Object.entries(properties)) {
      match(key, /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/, `${at}.properties`);
      validateMcpInputSchema(nested, `${at}.properties.${key}`, depth + 1);
    }
    const required = list(schema.required, `${at}.required`, 64).map(key => string(key, `${at}.required`, 64));
    unique(required, `${at}.required`);
    if (required.some(key => !Object.hasOwn(properties, key))) throw new Error(`${at}: unknown required property`);
    if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') throw new Error(`${at}.additionalProperties: expected boolean`);
  } else if (type === 'array') {
    validateMcpInputSchema(schema.items, `${at}.items`, depth + 1);
  } else if (schema.enum !== undefined) {
    const values = list(schema.enum, `${at}.enum`, 100);
    if (!values.length || values.some(v => typeof v !== 'string')) throw new Error(`${at}.enum: nonempty string array required`);
  }
}

export function validatePluginPlatformManifest(manifest: Obj, files: ReadonlyMap<string, Buffer>): { payloadCount: number } {
  const permissions = list(manifest.permissions, 'permissions', PERMISSIONS.length).map(p => oneOf(p, PERMISSIONS, 'permissions'));
  unique(permissions, 'permissions');
  const c = manifest.contributes === undefined ? {} : object(manifest.contributes, 'contributes');
  const settings = list(manifest.settings, 'settings', 20).map((raw, i) => {
    const s = object(raw, `settings[${i}]`);
    const key = match(s.key, KEY, 'settings.key');
    const type = oneOf(s.type, ['string', 'boolean', 'number', 'select'], 'settings.type');
    const scope = oneOf(s.scope ?? 'installation', ['installation', 'user', 'project'], 'settings.scope');
    if (s.secret !== undefined && typeof s.secret !== 'boolean') throw new Error('settings.secret: expected boolean');
    if (s.secret && (scope !== 'installation' || (s.default !== undefined && s.default !== ''))) throw new Error('settings: secret requires installation scope and empty default; use connections for user credentials');
    const options = list(s.options, 'settings.options', 100);
    if (options.some(option => typeof option !== 'string')) throw new Error('settings.options: expected strings');
    if (type === 'select' && !options.length) throw new Error('settings.options: select requires options');
    return { ...s, key, scope, secret: s.secret };
  });
  unique(settings.map(s => s.key), 'settings');
  const placements: string[] = [];
  const views = list(c.views, 'views', 10).map(raw => {
    const v = object(raw, 'views');
    fields(v, ['id', 'name', 'entry', 'placement', 'scope', 'defaultDock', 'allowedDocks'], 'views');
    const id = match(v.id, VIEW_ID, 'views.id');
    string(v.name, 'views.name', 120);
    entry(v.entry, 'views.entry', files);
    const placement = oneOf(v.placement, ['sidebar', 'workspace'], 'views.placement');
    placements.push(placement);
    oneOf(v.scope, ['project', 'global'], 'views.scope');
    const docks = list(v.allowedDocks, 'views.allowedDocks', 3).map(d => oneOf(d, ['left', 'right', 'bottom'], 'views.allowedDocks'));
    unique(docks, 'views.allowedDocks');
    if (placement !== 'sidebar' && (v.defaultDock !== undefined || v.allowedDocks !== undefined)) throw new Error('views: dock options apply only to sidebar');
    if (v.defaultDock !== undefined) oneOf(v.defaultDock, ['left', 'right', 'bottom'], 'views.defaultDock');
    if (v.defaultDock !== undefined && v.allowedDocks !== undefined && !docks.includes(oneOf(v.defaultDock, ['left', 'right', 'bottom'], 'views.defaultDock'))) throw new Error('views.defaultDock: must be allowed');
    return id;
  });
  unique(views, 'views'); unique(placements, 'views.placement');
  const connections = list(c.connections, 'connections', 10).map(raw => {
    const conn = object(raw, 'connections');
    fields(conn, ['id', 'label', 'baseUrl', 'auth', 'operations', 'billing'], 'connections');
    string(conn.label, 'connections.label', 200);
    const id = match(conn.id, VIEW_ID, 'connections.id');
    const base = https(conn.baseUrl, 'connections.baseUrl', true);
    const oauth = object(conn.auth, 'connections.auth');
    fields(oauth, ['type', 'authorizationUrl', 'tokenUrl', 'clientId', 'scopes'], 'connections.auth');
    const auth = oneOf(oauth.type, ['none', 'bearer', 'oauth2'], 'connections.auth.type');
    if (auth === 'oauth2') {
      https(oauth.authorizationUrl, 'oauth.authorizationUrl'); https(oauth.tokenUrl, 'oauth.tokenUrl');
      string(oauth.clientId, 'oauth.clientId', 512);
      list(oauth.scopes, 'oauth.scopes', 100).forEach(s => match(s, /^\S{1,200}$/, 'oauth.scopes'));
    }
    const ops = object(conn.operations, 'connections.operations');
    if (!Object.keys(ops).length || Object.keys(ops).length > 30) throw new Error('connections.operations: maximum 30');
    for (const [name, rawOp] of Object.entries(ops)) {
      match(name, OP_ID, 'connections.operations');
      const op = object(rawOp, `operations.${name}`);
      fields(op, ['path', 'method'], `operations.${name}`);
      const rel = match(op.path, /^\/[a-zA-Z0-9/_-]*$/, `operations.${name}.path`);
      if (rel.includes('//')) throw new Error('operations.path: empty segment');
      oneOf(op.method, ['GET', 'POST'], `operations.${name}.method`);
    }
    if (conn.billing !== undefined) {
      const billing = object(conn.billing, 'connections.billing');
      fields(billing, ['statusOperation', 'checkoutUrl'], 'connections.billing');
      if (!Object.hasOwn(ops, string(billing.statusOperation, 'billing.statusOperation'))) throw new Error('billing.statusOperation: unknown operation');
      https(billing.checkoutUrl, 'billing.checkoutUrl');
    }
    return { id, base };
  });
  unique(connections.map(c => c.id), 'connections');
  const servers = list(c.mcpServers, 'mcpServers', 8).map(raw => {
    const server = object(raw, 'mcpServers');
    fields(server, ['id', 'transport', 'url', 'connectionId', 'credentialKey', 'tools'], 'mcpServers');
    const id = match(server.id, /^[a-z0-9][a-z0-9-]{0,39}$/, 'mcpServers.id');
    oneOf(server.transport, ['streamable-http'], 'mcpServers.transport');
    const url = https(server.url, 'mcpServers.url');
    if (url.search) throw new Error('mcpServers.url: query is not allowed');
    if (server.connectionId !== undefined && server.credentialKey !== undefined) throw new Error('mcpServers: choose connectionId or credentialKey');
    if (server.connectionId !== undefined) {
      const conn = connections.find(c => c.id === server.connectionId);
      if (!conn || conn.base.origin !== url.origin) throw new Error('mcpServers.connectionId: declared same-origin connection required');
    }
    if (server.credentialKey !== undefined) {
      const key = match(server.credentialKey, /^[A-Za-z][A-Za-z0-9_-]{0,63}$/, 'mcpServers.credentialKey');
      if (!settings.some(s => s.key === key && s.secret === true && s.scope === 'installation')) throw new Error('mcpServers.credentialKey: declared installation secret required');
    }
    const tools = list(server.tools, 'mcpServers.tools', 64).map(rawTool => {
      const tool = object(rawTool, 'mcpServers.tools');
      fields(tool, ['name', 'description', 'inputSchema'], 'mcpServers.tools');
      const name = match(tool.name, /^[A-Za-z0-9_.-]{1,128}$/, 'mcpServers.tools.name');
      string(tool.description, 'mcpServers.tools.description');
      validateMcpInputSchema(tool.inputSchema);
      return name;
    });
    if (!tools.length) throw new Error('mcpServers.tools: at least one tool required');
    unique(tools, 'mcpServers.tools');
    return id;
  });
  unique(servers, 'mcpServers');
  if ((connections.length || servers.length) && !permissions.includes('network')) throw new Error('connections/mcpServers require network permission');
  return { payloadCount: views.length + connections.length + servers.length };
}
