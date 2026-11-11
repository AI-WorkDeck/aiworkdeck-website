#!/usr/bin/env bash
#
# 验「构建不碰正在服务的产物」这条性质本身
# ---------------------------------------------------------------------------
# 不是检查某几行代码长什么样，是真跑一次构建，然后断言 .next 一个文件都没被动过。
#
# 为什么值得占 CI 一分钟：这条性质一旦悄悄失效（有人把 next.config.ts 里的
# distDir 改回写死 ".next"，或者把部署脚本换回 `npm run build`），表现不是报错，
# 而是每次发版都重新出现几分钟的 500——**而且只打没被加载过的冷路由**，
# 热路由一切正常，日志里也只是零星 500，非常难归因。实测过一次：
# 就地构建 18 秒，83 次冷路由请求里 50 次 500，坏在 +0.8s ~ +20s。
#
# 用法（需要先有一份 .next，即先跑过 npm run build）：
#   bash scripts/verify-deploy-swap.sh
# ---------------------------------------------------------------------------
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# 与 deploy-build-swap.sh 用同一个暂存目录名：`next build` 会把 distDir 的 types 路径
# 自动写进 tsconfig.json 的 include，两个名字就要在 tsconfig 里挂两条。
STAGE=".next-build"
FAIL=0
ok()  { printf '\033[32m  PASS\033[0m %s\n' "$*"; }
bad() { printf '\033[31m  FAIL\033[0m %s\n' "$*"; FAIL=1; }

if [ ! -f .next/BUILD_ID ]; then
  echo "需要先有一份 .next（先跑 npm run build）" >&2
  exit 1
fi

# 「有没有被写过」用一个时间戳标记文件来判，不用 stat——`stat -f` 在 BSD 与 GNU 上
# 含义完全不同（GNU 那边是文件系统信息），写成跨平台分支很容易变成两边都恒等、
# 这一项静默失效。`find -newer <marker>` 两边语义一致。
MARKER="$(mktemp)"
BEFORE_ID="$(cat .next/BUILD_ID)"
BEFORE_N="$(find .next -type f | wc -l | tr -d ' ')"
sleep 1   # 保证 marker 的 mtime 严格早于构建期间任何一次写入
touch "$MARKER"
DIRTY_BEFORE="$(git diff --name-only 2>/dev/null | sort)"

echo "[swap] 用 AWD_BUILD_DIST_DIR 跑一次构建（线上产物应当纹丝不动）"
rm -rf "$STAGE"
AWD_BUILD_DIST_DIR="$STAGE" npm run build > /tmp/awd-verify-swap-build.log 2>&1 || {
  echo "构建失败，日志 /tmp/awd-verify-swap-build.log" >&2; tail -20 /tmp/awd-verify-swap-build.log >&2; exit 1
}

TOUCHED="$(find .next -newer "$MARKER" 2>/dev/null | head -5)"
AFTER_ID="$(cat .next/BUILD_ID)"
AFTER_N="$(find .next -type f | wc -l | tr -d ' ')"
rm -f "$MARKER"

[ -f "$STAGE/BUILD_ID" ] && ok "产物确实落在 $STAGE（distDir 环境变量生效）" \
  || bad "$STAGE/BUILD_ID 不存在——distDir 没有认 AWD_BUILD_DIST_DIR，构建八成又写回 .next 了"

if [ -z "$TOUCHED" ] && [ "$BEFORE_ID" = "$AFTER_ID" ] && [ "$BEFORE_N" = "$AFTER_N" ]; then
  ok "构建期间 .next 一个文件都没动（无新写入 / BUILD_ID 不变 / 文件数不变）"
else
  bad "构建动了 .next——就地构建又回来了，发版会重新出现几分钟的冷路由 500"
  [ -n "$TOUCHED" ] && printf '    被写过的（前 5 个）：\n%s\n' "$TOUCHED"
  [ "$BEFORE_ID" != "$AFTER_ID" ] && printf '    BUILD_ID: %s -> %s\n' "$BEFORE_ID" "$AFTER_ID"
  [ "$BEFORE_N" != "$AFTER_N" ] && printf '    文件数: %s -> %s\n' "$BEFORE_N" "$AFTER_N"
fi

# 换入的两个方向都要成立：新产物完整、旧产物留得下来可回滚
[ -f "$STAGE/BUILD_ID" ] && [ "$(cat "$STAGE/BUILD_ID")" != "$AFTER_ID" ] \
  && ok "暂存产物是新的一份（BUILD_ID 与线上不同）" \
  || bad "暂存产物的 BUILD_ID 与线上相同，换入等于没换"

rm -rf "$STAGE"

# 构建不许弄脏已跟踪文件。
# `next build` 会把 distDir 的 types 路径自动写进 tsconfig.json 的 include——
# 暂存目录换了个名字，它就往里加两条，于是**服务器上的工作区常年是脏的，
# 下一次 `git pull --ff-only` 直接被挡住、部署整个失败**（package-lock.json
# 早就有同款问题，两条部署路径里那句 `git checkout -- package-lock.json` 就是为它加的）。
# 解法是把那两条 include 提交进仓库，让 next 发现已经在了就不再写。
# 比的是「构建**新**弄脏了什么」，不是「工作区干不干净」——本地开发时手上本来就有改动，
# 拿干净与否当判据会一直红，红久了就等于没有这道闸。
NEWLY_DIRTY="$(comm -13 <(printf '%s\n' "$DIRTY_BEFORE") <(git diff --name-only 2>/dev/null | sort))"
if [ -z "$NEWLY_DIRTY" ]; then
  ok "构建没有新弄脏任何已跟踪文件（服务器上的 git pull --ff-only 不会被挡）"
else
  bad "构建弄脏了已跟踪文件，服务器上会挡住 git pull --ff-only："
  printf '%s\n' "$NEWLY_DIRTY" | sed 's/^/    /'
fi

# 换入不许弄丢上一代静态 chunk（dev-board#324）：/_next/static 文件名带内容哈希，
# 整体换掉 .next 会让旧 HTML 引用的 chunk 变 404——开着旧标签页/撞上部署窗口的用户
# 就随机丢样式表，表现为「对齐又坏了」且事后无法复现。这里真跑一次部署脚本（多花
# 一次构建，值），断言：上一代 chunk 换入后仍在、30 天以上的陈年 chunk 被清掉。
CANARY=".next/static/chunks/awd-retention-canary.css"
STALE=".next/static/chunks/awd-stale-canary.css"
touch "$CANARY"
touch -t "$(date -d '40 days ago' +%Y%m%d%H%M 2>/dev/null || date -v-40d +%Y%m%d%H%M)" "$STALE"
if bash scripts/deploy-build-swap.sh > /tmp/awd-verify-swap-run.log 2>&1; then
  [ -f "$CANARY" ] \
    && ok "上一代静态 chunk 换入后仍可服务（旧标签页不再 404）" \
    || bad "上一代静态 chunk 在换入后消失了——保留逻辑失效，发版又会打碎旧标签页的样式"
  [ ! -f "$STALE" ] \
    && ok "超过 30 天的陈年 chunk 被清理（static 不会无限膨胀）" \
    || bad "40 天前的陈年 chunk 没被清理——static 会随发版无限膨胀"
else
  bad "deploy-build-swap.sh 本身跑失败了，日志 /tmp/awd-verify-swap-run.log"
  tail -20 /tmp/awd-verify-swap-run.log >&2
fi
rm -f "$CANARY" "$STALE" .next/static/chunks/awd-*-canary.css 2>/dev/null

# 部署脚本不许 export 这个变量：一旦进了 shell 环境，
# `pm2 restart --update-env` 会把它带进运行时，线上进程就去读暂存目录了。
if grep -qE '^\s*export\s+AWD_BUILD_DIST_DIR' scripts/deploy-build-swap.sh; then
  bad "deploy-build-swap.sh export 了 AWD_BUILD_DIST_DIR——会被 pm2 --update-env 带进运行时"
else
  ok "部署脚本用的是行内赋值，不会漏进 pm2 运行时环境"
fi

[ "$FAIL" = 0 ] && printf '\033[32m[swap] 全部通过\033[0m\n' || printf '\033[31m[swap] 有失败\033[0m\n'
exit "$FAIL"
