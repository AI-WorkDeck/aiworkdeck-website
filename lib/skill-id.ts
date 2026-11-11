/**
 * Skill ID 格式规则。服务端校验（skills-store）与提交表单实时校验共用，
 * 本文件不得引入任何 Node 依赖（会被打进客户端 bundle）。
 */
export const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]{1,49}$/;
