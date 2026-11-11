// SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { SITE_ID, siteConfig } from '../site-config';
// Explicit product selection; new supplier releases never enter the menu automatically.
export const BAILIAN_CHAT_MODELS = ['qwen3.8-max', 'deepseek-v4-pro-0813', 'deepseek-v4.1-flash-1017', 'kimi/kimi-k3.1-pro', 'glm-5.3', 'MiniMax/MiniMax-M3.1-Flash'] as const;
export const platformProvider = () => SITE_ID === 'cn' ? 'bailian' as const : 'openrouter' as const;

function readAiConfigFileRaw(): Record<string, any> {
  try {
    const p = path.join(process.cwd(), 'data', 'ai-config.json');
    if (!existsSync(p)) return {};
    return JSON.parse(readFileSync(p, 'utf8')) || {};
  } catch {
    return {};
  }
}

export function deepseekConfig() {
  const file = readAiConfigFileRaw();
  const apiKey = (process.env.AWD_DEEPSEEK_API_KEY?.trim() || (typeof file.deepseekApiKey === 'string' ? file.deepseekApiKey.trim() : '')) || '';
  const rawBase = process.env.AWD_DEEPSEEK_BASE_URL?.trim() || (typeof file.deepseekBaseUrl === 'string' ? file.deepseekBaseUrl.trim() : '') || 'https://api.deepseek.com/v1';
  const defaultModel = process.env.AWD_DEEPSEEK_DEFAULT_MODEL?.trim() || (typeof file.deepseekDefaultModel === 'string' ? file.deepseekDefaultModel.trim() : '') || 'deepseek/deepseek-chat';
  return {
    apiKey,
    baseUrl: /^https:\/\/api\.deepseek\.com(?:\/v1)?\/?$/.test(rawBase) ? rawBase.replace(/\/+$/, '') : '',
    defaultModel,
  };
}

export const deepseekConfigured = () => {
  const c = deepseekConfig();
  return !!(c.apiKey && c.baseUrl);
};

export function isDeepSeekModelId(modelId: string): boolean {
  const m = (modelId || '').trim().toLowerCase();
  return m === 'deepseek-chat' || m === 'deepseek-reasoner' || m === 'deepseek-v3' || m === 'deepseek-v3.2' || m === 'deepseek-r1' || m === 'deepseek-v4-pro-0813' || m === 'deepseek-v4.1-flash-1017' || m.startsWith('deepseek/');
}

export function mapToDeepSeekUpstreamModel(modelId: string): string {
  const m = (modelId || '').trim().toLowerCase();
  if (m.includes('reasoner') || m.includes('r1')) return 'deepseek-reasoner';
  return 'deepseek-chat';
}
export function bailianConfig() {
  const workspace = process.env.BAILIAN_WORKSPACE_ID?.trim();
  const raw = process.env.BAILIAN_BASE_URL || (workspace ? `https://${workspace}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` : '');
  let baseUrl = '';
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash
      && (url.hostname === 'dashscope.aliyuncs.com' || /^[a-z0-9-]+\.cn-beijing\.maas\.aliyuncs\.com$/.test(url.hostname))
      && url.pathname.replace(/\/$/, '') === '/compatible-mode/v1') baseUrl = raw.replace(/\/$/, '');
  } catch { /* Invalid configuration fails closed. */ }
  return { apiKey: process.env.DASHSCOPE_API_KEY || '', baseUrl,
    defaultModel: 'qwen3.8-max' };
}
export const bailianConfigured = () => { const c = bailianConfig(); return !!(c.apiKey && c.baseUrl && process.env.AWD_KEY_ENCRYPTION_SECRET); };
export const platformBaseUrl = () => `${siteConfig.origin}/api/account/ai/v1`;

/** Deployment-owned, nonsecret snapshot of the workspace's INFERENCE grants. */
export function bailianAuthorizedModels(): Set<string> { return readModelSnapshot('BAILIAN_AUTHORIZED_MODELS_FILE'); }
/** Independently maintained snapshot of models successfully exercised in this workspace. */
export function bailianAvailableModels(): Set<string> { return readModelSnapshot('BAILIAN_AVAILABLE_MODELS_FILE'); }
function readModelSnapshot(variable: string): Set<string> {
  try {
    const snapshot = JSON.parse(readFileSync(process.env[variable] || '', 'utf8'));
    const config = bailianConfig();
    const workspace = process.env.BAILIAN_WORKSPACE_ID || new URL(config.baseUrl).hostname.split('.')[0];
    if (snapshot.workspaceId !== workspace || !Array.isArray(snapshot.models) || !snapshot.models.length
      || snapshot.models.some((id: unknown) => typeof id !== 'string' || !/^[A-Za-z0-9._/-]+$/.test(id))) throw new Error();
    return new Set(snapshot.models);
  } catch { throw new Error('catalog_unavailable'); }
}

/** Only deployment-verified compatibility constraints; never accept caller-supplied overrides. */
export function bailianModelConstraints(id:string): { thinking?:true; temperature?:number } {
  try {
    const snapshot=JSON.parse(readFileSync(process.env.BAILIAN_AVAILABLE_MODELS_FILE || '', 'utf8'));
    if(!bailianAvailableModels().has(id))return {};
    const value=snapshot.constraints?.[id];
    if(!value)return {};
    if(value.thinking!==true || (value.temperature!==undefined && value.temperature!==1))throw new Error();
    return {thinking:true,...(value.temperature===1?{temperature:1}:{})};
  } catch {throw new Error('catalog_unavailable');}
}
