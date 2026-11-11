import { platformModels } from './platform-ai/catalog';
import { getAiConfig } from '@/lib/ai-config';

/** Skill menu: domestic models follow workspace grants and the live Bailian price catalog.
 * International models follow OpenRouter’s text-capable catalog. */
export interface AiModelOption {
  id: string;
  /** 展示名：真实模型名（用户拍板：不做档位化抽象） */
  label: string;
  /** 速度标注（约多少秒出全稿），进词典没必要——模型名本身就不翻译 */
  note: { zh: string; en: string };
  /** 深推理模型：先长时间输出 reasoning 再落笔，前端构思期要显示思考进度 */
  deep?: boolean;
  /** 上游总时限（毫秒）。深推理模型给足 5 分钟，普通模型 2 分钟兜底。 */
  timeoutMs: number;
}

const NORMAL_TIMEOUT_MS = 120_000;
const DEEP_TIMEOUT_MS = 300_000;


export async function listAiModels(): Promise<AiModelOption[]> {
  return (await platformModels()).map(m => ({ id:m.id,label:m.name,note:{zh:'',en:''},deep:m.supportsReasoning,timeoutMs:m.supportsReasoning?DEEP_TIMEOUT_MS:NORMAL_TIMEOUT_MS }));
}

/**
 * 默认模型：后台配置（ai-config.json 的 model）优先，但必须在菜单内；
 * 不在菜单（配错/已下线/历史遗留）就落回菜单第一位，绝不把请求发给菜单外的模型。
 */
export async function defaultAiModel(): Promise<AiModelOption> {
  const models = await listAiModels();
  const configured = getAiConfig().model;
  return models.find(m => m.id === configured) || models[0];
}

/** 校验用户点选的模型；非法值一律折回默认，不给前端拼 id 直通任意模型的口子。 */
export async function resolveAiModel(requested: unknown): Promise<AiModelOption> {
  if (typeof requested === 'string' && requested) {
    const hit = (await listAiModels()).find(m => m.id === requested);
    if (hit) return hit;
  }
  return defaultAiModel();
}
