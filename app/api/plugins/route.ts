import { NextRequest, NextResponse } from 'next/server';
import { toBaseLocale } from '@/i18n-config';
import { pluginAuthor, developerApiError, privateJson } from '@/lib/developer-api';
import { getDeveloper, requireApprovedDeveloper } from '@/lib/developers';
import { withTransaction } from '@/lib/db';
import { listPlugins, submitPlugin, LIMITS, MAX_PLUGIN_PRICE_CENTS, type SubmitError } from '@/lib/plugins-store';
import { pickLangText, resolveRequestLocale } from '@/lib/api-locale';

export const dynamic = 'force-dynamic';
// 插件包最大 20MB，默认 body 上限不够
export const maxDuration = 60;

const ERROR_MESSAGES: Record<SubmitError, string> = {
  developer_permissions_required: '插件使用了开发者资料尚未批准的权限，请更新资料并重新申请',
  package_too_large: `插件包超过 ${LIMITS.packageBytes / 1024 / 1024} MB 上限`,
  too_many_entries: `压缩包条目超过 ${LIMITS.entryCount} 个上限`,
  file_too_large: '包内存在超大文件（解压后单文件上限 50 MB）',
  bad_zip: '无法解析的压缩包，请确认是标准 zip 格式',
  unsafe_path: '压缩包内存在非法路径（不得含 .. 或绝对路径）',
  manifest_missing: '压缩包根目录缺少 manifest.json（不要多套一层目录）',
  manifest_invalid: 'manifest.json 不是合法 JSON 对象或声明不符合宿主契约',
  invalid_id: 'manifest.id 非法：需为 2-50 位小写字母、数字或连字符',
  invalid_version: 'manifest.version 需为语义化版本，如 1.0.0',
  id_taken: '该插件 id 已被其他作者占用',
  version_not_newer: '版本号必须高于已提交的最高版本',
  jar_missing: 'backendJars 声明的 JAR 不在包内',
  frontend_entry_invalid: 'manifest.frontendEntry 必须是包内 web/ 目录下的相对路径（推荐 web/index.html）',
  no_payload: '插件没有任何载荷——至少要有后端 JAR、web/ 界面，或声明式内容（contributes.templates/styleProfiles、settings、evidenceSources，规范 v2.9）',
  contributed_file_missing: 'contributes 声明的模板/画像/皮肤文件不在包内或路径非法',
};

const ERROR_MESSAGES_EN: Record<SubmitError, string> = {
  developer_permissions_required: 'This plugin uses permissions not yet approved on your developer profile. Please update your profile and reapply.',
  package_too_large: `Plugin package exceeds the ${LIMITS.packageBytes / 1024 / 1024} MB limit`,
  too_many_entries: `Archive exceeds the ${LIMITS.entryCount}-entry limit`,
  file_too_large: 'Archive contains an oversized file (50 MB per-file unzipped limit)',
  bad_zip: 'Invalid ZIP archive. Please ensure it is a standard .zip file.',
  unsafe_path: 'Archive contains unsafe paths (.. or absolute paths are not allowed)',
  manifest_missing: 'manifest.json is missing from the archive root (do not wrap files in an extra top-level folder)',
  manifest_invalid: 'manifest.json is not a valid JSON object or does not conform to the host contract',
  invalid_id: 'manifest.id is invalid: must be 2–50 lowercase letters, digits, or hyphens',
  invalid_version: 'manifest.version must be a semantic version such as 1.0.0',
  id_taken: 'This plugin id is already taken by another author',
  version_not_newer: 'Version must be higher than the latest submitted version',
  jar_missing: 'JAR declared in backendJars is missing from the archive',
  frontend_entry_invalid: 'manifest.frontendEntry must be a relative path under web/ inside the archive (recommended: web/index.html)',
  no_payload: 'Plugin has no payload — include at least a backend JAR, a web/ UI, or declarative contributions (contributes.templates/styleProfiles/themes, settings, evidenceSources; spec v2.9)',
  contributed_file_missing: 'Template or style profile or theme file declared in contributes is missing from the archive or has an invalid path',
};

/** 我的提交列表（含各版本审核状态） */
export async function GET(request: NextRequest) {
  try {
    const user = pluginAuthor(request, true);
    return privateJson({ plugins: listPlugins().filter(p => p.authorId === user.id) });
  } catch (e) { return developerApiError(e); }
}

/**
 * 提交插件包（multipart/form-data，字段名 file）。
 * 受理成功后状态为 pending，需人工审核通过并签名才会出现在 registry。
 */
export async function POST(request: NextRequest) {
  try { requireApprovedDeveloper(pluginAuthor(request).id); }
  catch (e) { return developerApiError(e); }

  let lang = resolveRequestLocale(request);
  let buffer: Buffer;
  // undefined = 未传价格（新版本继承上一版本标价，见 submitPlugin）；显式传 0 才是改为免费
  let priceCents: number | undefined;
  try {
    const form = await request.formData();
    lang = resolveRequestLocale(request, form.get('lang'));
    const messages = toBaseLocale(lang) === 'en' ? ERROR_MESSAGES_EN : ERROR_MESSAGES;
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'no_file', message: pickLangText(lang, '请选择要上传的插件包', 'Please select a plugin package to upload') },
        { status: 400 }
      );
    }
    if (file.size > LIMITS.packageBytes) {
      return NextResponse.json(
        { error: 'package_too_large', message: messages.package_too_large },
        { status: 400 }
      );
    }
    // 定价（PR-W3）：0 或 1~199900 分
    const rawPrice = form.get('priceCents');
    if (typeof rawPrice === 'string' && rawPrice !== '') {
      priceCents = Number(rawPrice);
      if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > MAX_PLUGIN_PRICE_CENTS) {
        return NextResponse.json(
          {
            error: 'invalid_price',
            message: pickLangText(lang, '价格需为 0（免费）或 0.01 到 1999 元', 'Price must be 0 (free) or between 0.01 and 1999 CNY'),
          },
          { status: 400 }
        );
      }
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return NextResponse.json(
      { error: 'bad_request', message: pickLangText(lang, '上传失败，请重试', 'Upload failed. Please try again.') },
      { status: 400 }
    );
  }

  let result: ReturnType<typeof submitPlugin>;
  try {
    result = withTransaction(() => {
      const user = pluginAuthor(request, true);
      requireApprovedDeveloper(user.id);
      return submitPlugin(buffer, { id: user.id, username: user.username }, { priceCents, allowedPermissions: getDeveloper(user.id)!.permissions });
    });
  } catch (e) { return developerApiError(e); }
  const { plugin, error, detail } = result;
  if (error || !plugin) {
    const isEn = toBaseLocale(lang) === 'en';
    const messages = isEn ? ERROR_MESSAGES_EN : ERROR_MESSAGES;
    const message = messages[error as SubmitError] || pickLangText(lang, '提交失败', 'Submission failed');
    const localizedDetail = detail
      ? isEn
        ? detail
            .replace(/^已有版本 (.+)$/, 'existing version $1')
            .replace(/\(空\)$/, '(empty)')
        : detail
      : undefined;
    return NextResponse.json(
      {
        error,
        message: localizedDetail
          ? isEn
            ? `${message} (${localizedDetail})`
            : `${message}（${localizedDetail}）`
          : message,
      },
      { status: error === 'developer_permissions_required' ? 403 : 400 }
    );
  }
  return privateJson({
    plugin: { id: plugin.id, version: plugin.version, status: plugin.status, scan: plugin.scan },
  });
}
