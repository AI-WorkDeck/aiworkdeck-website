#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# promote-next-artifact.yml 的 runner 侧：在服务器后台跑一个阶段并轮询状态文件。
# 成败不押在一条 SSH 连接上（npm ci / better-sqlite3 编译曾把会话挤掉，见 DEPLOY.md §9.3）。
# 用法：promote-remote-phase.sh prepare|activate|rollback   或   wait PHASE（只等不启动）
# 需要环境变量 IP、REL；SSH 选项来自 ~/.ssh/config（钉死主机公钥）。
set -euo pipefail
mode="$1"; phase="${2:-$1}"
[[ "$phase" =~ ^(prepare|activate|rollback)$ ]] || { echo "bad phase" >&2; exit 2; }
remote() { ssh "root@$IP" bash "'$REL/promote-next-artifact.sh'" "$@"; }
if [ "$mode" != wait ]; then
  for i in 1 2 3 4 5; do remote start "$phase" "'$REL'" && break; [ "$i" = 5 ] && exit 1; sleep 10; done
fi
st=
for i in $(seq 1 120); do   # 最多 40 分钟
  st="$(remote status "$phase" "'$REL'" 2>/dev/null || true)"
  [ -n "$st" ] && break
  echo "…$phase 进行中（$((i * 20)) 秒）"; sleep 20
done
echo "===== $phase.log ====="
ssh "root@$IP" "tail -60 '$REL/$phase.log'" || true
[ -n "$st" ] || { echo "::error::$phase 40 分钟未结束"; exit 1; }
[ "$st" = 0 ] || { echo "::error::$phase 退出码 $st"; exit 1; }
