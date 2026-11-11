#!/usr/bin/env bash
#
# 构建到暂存目录，成功后原子换入 .next。调用方负责随后重启 pm2。
# ---------------------------------------------------------------------------
# 为什么不直接 `npm run build`：`next start` 在跑的时候就地构建，会把正在服务的
# .next 边写边换。已被请求过的路由不受影响（模块在 Node 的 module registry 里，
# 不再碰盘），但**任何还没被加载过的路由整场构建期间都是 500**——本地实测 18 秒的
# 构建里 83 次冷路由请求有 50 次 500。生产机构建以分钟计，窗口只会更长。
#
# 换成「建到别处、成功后再换」之后：
#   - 构建期间线上完全不受影响（老 .next 一个字节没动）；
#   - 构建失败线上继续跑旧版本，不再留下没有 BUILD_ID 的残缺产物
#     （next.config.ts 里记的 2026-07-27 事故形态）；
#   - 上一份产物留在 .next-old，可以一条命令回滚。
#
# 剩下的窗口只有 pm2 重启那几秒，nginx 侧有 503 兜底页接着（见 deploy/nginx/）。
#
# 用法（cn 与 intl 两条部署路径共用这一份，别再各抄一遍——ci.yml 里那条注释
# 说的就是抄两份必然会漂）：
#   bash scripts/deploy-build-swap.sh && pm2 restart <name> --update-env
#
# 回滚（构建是好的但代码有问题时）：
#   mv .next .next-bad && mv .next-old .next && pm2 restart <name> --update-env
# ---------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
STAGE=".next-build"

echo "=== 构建到 $STAGE（线上仍在读 .next）==="
rm -rf "$STAGE"
# **行内赋值，不要 export**：`next start` 读的是同一份 next.config.ts，
# 这个变量一旦进了 shell 环境，`pm2 restart --update-env` 会把它带进运行时，
# 线上进程就去读暂存目录了。
AWD_BUILD_DIST_DIR="$STAGE" npm run build

# 走到这里说明构建成功（set -e）。换入前先把**正在服务的上一代静态资源**并进
# 新产物：/_next/static 下的文件名都带内容哈希、跨构建互不冲突，但每次整体换掉
# .next 会让上一代的 chunk 从线上消失——开着旧标签页、或恰好在部署窗口拿到旧 HTML
# 的用户，去请求旧哈希的 CSS/JS 就是 404，表现为随机的「样式坏了/对齐不对」且事后
# 无法复现（dev-board#324 实锤：上一代的 css chunk 在源站 404）。
# --ignore-existing 保证新构建的同名文件优先；-a 保留 mtime，好按时间清理。
if [ -d .next/static ]; then
  echo "=== 保留上一代静态 chunk（防旧标签页 404）==="
  rsync -a --ignore-existing .next/static/ "$STAGE/static/"
fi
# 只清超过 30 天的陈年 chunk：比这更老的 HTML 早就不该还开着了
find "$STAGE/static" -type f -mtime +30 -delete 2>/dev/null || true
find "$STAGE/static" -type d -empty -delete 2>/dev/null || true

# 以下两步之间不要插任何东西：
# 老进程从 mv 的那一刻起读到的就是新产物，越早重启越好。
echo "=== 换入 ==="
rm -rf .next-old
if [ -d .next ]; then
  mv .next .next-old
fi
mv "$STAGE" .next
echo "=== 已换入，上一份留在 .next-old；现在去重启 pm2 ==="
