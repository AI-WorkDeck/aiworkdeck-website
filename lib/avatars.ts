import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

/**
 * 头像文件存储。
 *
 * 落在 `data/avatars/<userId>.webp`，与 awd.db、users.json 同级。
 *
 * **为什么不是 `public/`**：那里的静态文件会遮挡同名 app 路由（favicon 那次踩过，
 * 官网 PR #30/#31）。而 `data/` 已经是既定的运行时目录——不入库、部署不清、
 * 已在服务器备份口径内。
 *
 * 文件名恒由 userId 拼出，**用户提供的文件名一概不采信**，路径穿越没有入口。
 */

const AVATAR_DIR = path.join(process.cwd(), 'data', 'avatars');

/** 输出边长。头像最大展示位是 account 概览头部的 72px，2x 屏取 144，256 留足余量。 */
export const AVATAR_SIZE = 256;

/** 入口体积上限。前端也拦一道，但那纯属体验，安全边界在这里。 */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * 解码像素上限（50 MP）。
 *
 * 挡的是解压炸弹：几十 KB 的 PNG 可以声明上亿像素，解码那一刻直接打满内存。
 * 体积上限拦不住它——炸弹的特征恰恰是体积极小。
 */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * 允许的输入格式。
 *
 * **SVG 不在内**：librsvg 会去解析外部引用，且矢量本身可以构造成渲染炸弹。
 * 头像没有任何非要矢量不可的理由，直接不收。
 */
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

export type AvatarError = 'too_large' | 'unsupported_format' | 'invalid_image';

/**
 * userId 形状白名单（UUID 与历史 id 都在内）。
 *
 * **不是装饰**：`GET /api/avatar/[userId]` 的 userId 直接来自 URL 路径，
 * 一个 `..%2F..%2Fdata%2Fusers.json` 拼进 path.join 就走出了目录。
 * 用允许集而不是过滤黑名单——黑名单永远漏。
 */
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

function avatarFile(userId: string): string | null {
  if (!ID_RE.test(userId)) return null;
  return path.join(AVATAR_DIR, `${userId}.webp`);
}

/**
 * 存头像：一律重编码，绝不原样落盘。
 *
 * 这一步同时解决四件事，缺一不可：
 * - **靠真实解码判定是不是图片**，而不是靠扩展名或 Content-Type——两者都是客户端说了算
 * - **剥掉 EXIF**（sharp 默认不带元数据出），其中含拍摄定位
 * - **只取首帧**（animated: false），杜绝动图头像
 * - **限像素**挡解压炸弹
 *
 * `.rotate()` 必须在 resize 之前且不能省：EXIF 里的方向标记被剥掉之后，
 * 手机竖拍的照片会整个躺倒。无参调用 = 按 EXIF 方向先转正再丢掉标记。
 */
export async function saveAvatar(
  userId: string,
  input: Buffer
): Promise<{ stamp?: string; error?: AvatarError }> {
  if (input.length > AVATAR_MAX_BYTES) return { error: 'too_large' };
  const file = avatarFile(userId);
  if (!file) return { error: 'invalid_image' };

  let output: Buffer;
  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false });
    const meta = await image.metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) return { error: 'unsupported_format' };
    output = await image
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return { error: 'invalid_image' };
  }

  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, output);
  fs.renameSync(tmp, file);

  return { stamp: new Date().toISOString() };
}

export function deleteAvatar(userId: string): void {
  const file = avatarFile(userId);
  if (file) fs.rmSync(file, { force: true });
}

/** 读字节，没有就是 null（调用方回 404，前端降级首字母）。 */
export function readAvatar(userId: string): Buffer | null {
  const file = avatarFile(userId);
  if (!file || !fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}
