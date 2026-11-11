#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# 生产机侧：把 CI 已验证的 Next 产物换入（dev-board#1648 之后的 promoter）。
# 由 .github/workflows/promote-next-artifact.yml 上传到 $APP/.promote/<id>/ 后调用。
# ---------------------------------------------------------------------------
# 红线（scripts/promote-next-artifact.test.mjs 钉着）：
#   - 这台机上**绝不** next build / npm run build / deploy-build-swap.sh——
#     2026-10-31 北京机 1.8G 内存上就地构建把两站都 OOM 掉了；
#   - 依赖只在暂存目录按冻结 lock `npm ci`，且套内存上限；
#   - 不碰 .env*、data/、crontab；git 只做 merge --ff-only，绝不 reset --hard / clean；
#   - 换入后任何一步失败都自动回滚到上一版并以非零退出。
#
# 用法：
#   promote-next-artifact.sh start    PHASE REL   后台跑 PHASE（抗 SSH 断线），状态落 REL/PHASE.status
#   promote-next-artifact.sh status   PHASE REL   打印 PHASE 的退出码（未结束则为空）
#   promote-next-artifact.sh prepare  REL         校验+暂存依赖，不动线上
#   promote-next-artifact.sh activate REL         换入+重启+本机健康检查，失败自动回滚
#   promote-next-artifact.sh rollback REL         回到换入前的那一版（幂等）
# ---------------------------------------------------------------------------
set -Eeuo pipefail
umask 022

die() { echo "PROMOTE-ERROR: $*" >&2; exit 1; }
log() { echo "=== $* ==="; }
script="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)/$(basename "${BASH_SOURCE[0]}")"

cmd="${1:-}"
case "$cmd" in
  start|status)
    phase="${2:-}"; rel="${3:-}"
    [[ "$phase" =~ ^(prepare|activate|rollback)$ ]] || die "unknown phase"
    [ -d "$rel" ] || die "missing release dir"
    if [ "$cmd" = status ]; then cat "$rel/$phase.status" 2>/dev/null || true; exit 0; fi
    # 重试安全：已在跑或已成功就不再启动第二份
    if [ -f "$rel/$phase.pid" ] && kill -0 "$(cat "$rel/$phase.pid")" 2>/dev/null; then echo "already running"; exit 0; fi
    if [ "$(cat "$rel/$phase.status" 2>/dev/null)" = 0 ]; then echo "already done"; exit 0; fi
    rm -f "$rel/$phase.status"
    nohup setsid bash -c 'bash "$0" "$1" "$2" > "$2/$1.log" 2>&1; echo $? > "$2/$1.status"' \
      "$script" "$phase" "$rel" < /dev/null > /dev/null 2>&1 &
    echo $! > "$rel/$phase.pid"
    echo "started $phase"; exit 0 ;;
  prepare|activate|rollback) rel="${2:-}" ;;
  *) die "usage: $0 start|status PHASE REL | prepare|activate|rollback REL" ;;
esac

[ -n "$rel" ] && [ -d "$rel" ] || die "release dir must exist"
rel="$(cd "$rel" && pwd -P)"

# ---- release.env：白名单键 + 逐项校验，不 source --------------------------------
KEYS=" SITE SHA APP PM2_NAME NODE_BIN SQLITE_PYTHON HOST PORT NEXT_TAR_SHA256 WEB_TAR_SHA256 NODE_ABI "
for k in $KEYS; do printf -v "$k" '%s' ''; done
while IFS= read -r line || [ -n "$line" ]; do
  [ -z "$line" ] && continue
  k="${line%%=*}"; v="${line#*=}"
  case "$KEYS" in *" $k "*) printf -v "$k" '%s' "$v" ;; *) die "unexpected release.env key: $k" ;; esac
done < "$rel/release.env"
[[ "$SITE" =~ ^(cn|intl)$ ]] || die "bad SITE"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || die "bad SHA"
[[ "$APP" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "bad APP"
[[ "$PM2_NAME" =~ ^[A-Za-z0-9_-]+$ ]] || die "bad PM2_NAME"
[[ -z "$NODE_BIN" || "$NODE_BIN" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "bad NODE_BIN"
[[ -z "$SQLITE_PYTHON" || "$SQLITE_PYTHON" =~ ^/[A-Za-z0-9._/-]+$ ]] || die "bad SQLITE_PYTHON"
[[ "$HOST" =~ ^[a-z0-9.-]+$ ]] || die "bad HOST"
[[ "$PORT" =~ ^[0-9]{2,5}$ ]] || die "bad PORT"
[[ "$NEXT_TAR_SHA256" =~ ^[0-9a-f]{64}$ && "$WEB_TAR_SHA256" =~ ^[0-9a-f]{64}$ ]] || die "bad digest"
[[ "$NODE_ABI" =~ ^[0-9]+$ ]] || die "bad NODE_ABI"
APP="$(cd "$APP" && pwd -P)"
[ "$(dirname "$rel")" = "$APP/.promote" ] || die "release dir must live in $APP/.promote/"
# 与 pm2 解释器一致的 Node（北京默认 shell 是 v20，见 DEPLOY.md「那个 export PATH 不是可选的」）
[ -n "$NODE_BIN" ] && export PATH="$NODE_BIN:$PATH"
STATE="$APP/.promote/state"
cd "$APP"

sha256() { sha256sum "$1" | cut -d' ' -f1; }
sqlite_probe() {  # 在 $1 下真加载 better-sqlite3，并核 ABI 与 CI 构建一致
  (cd "$1" && node -e 'const D=require("better-sqlite3");const d=new D(":memory:");d.exec("create table t(a)");d.prepare("insert into t values (1)").run();d.close();if(process.versions.modules!==process.argv[1])throw Error("ABI "+process.versions.modules+" != "+process.argv[1]);console.log("better-sqlite3 OK abi="+process.versions.modules)' "$NODE_ABI")
}
# 内存上限：npm ci / 原生编译与线上站点共用一台机。没有 systemd-run 就不跑，
# 不退化成无上限安装。两台机已升到 8G（2026-11 实测北京 7.2G 可用 4.3G）；900M 时
# npm ci 自身 RSS 顶到上限被 cgroup OOM 杀（2026-11-06 run 42155968765 / 42160255173），
# 改为 1600M，并把下面的空闲内存门槛同步抬到 2200MB，保证上限吃满时线上仍有余量。
capped() {
  command -v systemd-run >/dev/null || die "systemd-run missing: refusing uncapped install"
  systemd-run --scope --quiet -p MemoryMax=1600M -p MemorySwapMax=0 \
    nice -n 10 env NODE_OPTIONS=--max-old-space-size=512 "$@"
}
lcurl() {  # 本机直打 next，绕开 nginx/geo 分流与代理
  curl -sS --noproxy '*' --max-time 20 -H "Host: $HOST" -H "Cookie: awd_site=$SITE; awd_lang=en" "$@"
}
local_health() {
  local i code
  for i in $(seq 1 45); do
    code="$(lcurl -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/en/start" || true)"
    [ "$code" = 200 ] && break
    sleep 2
  done
  [ "$code" = 200 ] || { echo "local /en/start = $code"; return 1; }
  if [ "$SITE" = cn ]; then
    lcurl "http://127.0.0.1:$PORT/api/registry/skills" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);if(!Array.isArray(a)||!a.length)process.exit(1);console.log("registry "+a.length)})' \
      || { echo "registry empty"; return 1; }
  else
    code="$(lcurl -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"key":"promote-healthcheck"}' "http://127.0.0.1:$PORT/api/license/verify-key" || true)"
    [ "$code" = 200 ] || { echo "verify-key = $code"; return 1; }
  fi
  sqlite_probe "$APP" || return 1
  # pm2 实际解释器与上面探针用的 node 必须同版本（ABI 坑）；pm2 没报版本时只告警
  local pm2v
  pm2v="$(pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name===process.argv[1]);process.stdout.write(String(p&&p.pm2_env&&p.pm2_env.node_version||""))})' "$PM2_NAME")"
  if [ -z "$pm2v" ]; then echo "WARN: pm2 did not report node_version"
  elif [ "v$pm2v" != "$(node -v)" ] && [ "$pm2v" != "$(node -v)" ]; then echo "pm2 node $pm2v != $(node -v)"; return 1; fi
}
step_done() { echo "step=$1" >> "$STATE"; }
state_get() { sed -n "s/^$1=//p" "$STATE" | head -1; }
cur_phase() { sed -n 's/^phase=//p' "$STATE" | tail -1; }
has_step() { grep -qx "step=$1" "$STATE"; }

prepare() {
  [ ! -e "$rel/prepared" ] || { log "already prepared"; return 0; }
  git rev-parse --is-inside-work-tree > /dev/null
  pm2 describe "$PM2_NAME" > /dev/null || die "pm2 app $PM2_NAME not found"
  [ "$(sha256 "$rel/next-artifact.tar.gz")" = "$NEXT_TAR_SHA256" ] || die "Next tar digest mismatch"
  [ "$(sha256 "$rel/web-workbench.tar.gz")" = "$WEB_TAR_SHA256" ] || die "Web tar digest mismatch"
  local mem disk
  mem="$(awk '/^MemAvailable:/{print int($2/1024)}' /proc/meminfo)"
  [ "${mem:-0}" -ge 2200 ] || die "MemAvailable ${mem}MB < 2200MB; not installing next to live sites"
  disk="$(df -Pk "$APP" | awk 'NR==2{print int($4/1024)}')"
  [ "${disk:-0}" -ge 2048 ] || die "free disk ${disk}MB < 2048MB"

  log "解包并逐文件复核 SHA（精确文件集）"
  rm -rf "$rel/bundle" "$rel/deps" "$rel/web"; mkdir "$rel/bundle" "$rel/web"
  tar --no-same-owner -xzf "$rel/next-artifact.tar.gz" -C "$rel/bundle"
  [ -z "$(cd "$rel/bundle" && find . ! -type f ! -type d | head -1)" ] || die "non-regular file in bundle"
  diff <(cd "$rel/bundle" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) \
       <(cut -c67- "$rel/files.sha256" | LC_ALL=C sort) > /dev/null || die "bundle file set differs from verified list"
  (cd "$rel/bundle" && sha256sum -c --quiet --strict "$rel/files.sha256") || die "bundle file SHA mismatch"
  node -e 'const p=require(process.argv[1]);const [sha,site,abi]=process.argv.slice(2);if(p.sourceSha!==sha||p.site!==site||p.buildMode!=="webpack"||String(p.nodeAbi)!==abi)throw Error("provenance mismatch")' \
    "$rel/bundle/provenance.json" "$SHA" "$SITE" "$NODE_ABI"

  log "核 source SHA 已合入 origin/master 且可快进"
  git fetch --quiet origin master
  git cat-file -e "$SHA^{commit}" || die "source SHA unknown on server"
  git merge-base --is-ancestor "$SHA" origin/master || die "source SHA is not on origin/master"
  git merge-base --is-ancestor HEAD "$SHA" || die "server HEAD is not an ancestor of source SHA (no ff possible)"
  for f in package.json package-lock.json next.config.ts; do
    [ "$(git show "$SHA:$f" | sha256sum | cut -d' ' -f1)" = "$(sha256 "$rel/bundle/$f")" ] || die "$f differs from git $SHA"
  done

  log "暂存目录按冻结 lock 准备运行依赖（限内存；不构建 Next）"
  mkdir "$rel/deps"
  cp "$rel/bundle/package.json" "$rel/bundle/package-lock.json" "$rel/deps/"
  # 国际站：预编译包下不来时 npm ci 会就地 node-gyp 编 better-sqlite3，系统默认 python3.6 跑不了新版 gyp
  # （2026-11-06 首次国际站 promote 失败于此）。有 SQLITE_PYTHON 就让 npm ci 也用它。
  if [ -n "$SQLITE_PYTHON" ]; then
    (cd "$rel/deps" && PYTHON="$SQLITE_PYTHON" npm_config_python="$SQLITE_PYTHON" capped npm ci --no-audit --no-fund)
  else
    (cd "$rel/deps" && capped npm ci --no-audit --no-fund)
  fi
  if ! sqlite_probe "$rel/deps"; then
    # 新加坡 glibc 2.32 跑不了预编译产物（DEPLOY.md §9.3 坑 3）：从源码编，覆盖 prebuilds
    [ -n "$SQLITE_PYTHON" ] || die "better-sqlite3 failed to load"
    log "better-sqlite3 从源码重编（PYTHON=${SQLITE_PYTHON}）"
    (cd "$rel/deps/node_modules/better-sqlite3" && PYTHON="$SQLITE_PYTHON" capped npm run build-release \
      && mkdir -p prebuilds && cp -f build/Release/better_sqlite3.node prebuilds/linux-x64.node)
    sqlite_probe "$rel/deps" || die "better-sqlite3 still fails after source rebuild"
  fi
  [ "$(sha256 "$rel/deps/package-lock.json")" = "$(sha256 "$rel/bundle/package-lock.json")" ] || die "npm ci changed the lock"

  tar --no-same-owner -xzf "$rel/web-workbench.tar.gz" -C "$rel/web"
  echo "$SHA" > "$rel/prepared"
  log "PREPARED（线上未改动）"
}

rollback() {
  [ -f "$STATE" ] && [ "$(state_get release)" = "$rel" ] || die "state does not belong to this release"
  if [ "$(cur_phase)" = rolled-back ]; then log "already rolled back"; return 0; fi
  log "回滚到换入前的版本"
  local prev_head prev_web
  prev_head="$(state_get prev_head)"; prev_web="$(state_get prev_web)"
  if has_step deps && [ -d .node_modules-old ]; then
    rm -rf "$rel/failed-node_modules"; mv node_modules "$rel/failed-node_modules"; mv .node_modules-old node_modules
  fi
  if has_step next && [ -d .next-old ]; then
    rm -rf "$rel/failed-next"; mv .next "$rel/failed-next"; mv .next-old .next
  fi
  if has_step web && [ -n "$prev_web" ] && [ "$(readlink public/web || true)" != "$prev_web" ]; then
    ln -s "$prev_web" "public/.web-next-rollback-$$" && mv -T "public/.web-next-rollback-$$" public/web
  fi
  if has_step git && [ "$(git rev-parse HEAD)" != "$prev_head" ]; then
    git checkout -- package-lock.json 2>/dev/null || true
    # --keep 不是 --hard：有本地改动会被覆盖时直接拒绝，服务器上的未提交数据不丢
    git reset --keep "$prev_head"
  fi
  if has_step restart || has_step next || has_step deps; then pm2 restart "$PM2_NAME" --update-env; fi
  echo "phase=rolled-back" >> "$STATE"
  rm -rf "$rel/failed-node_modules"
  if local_health; then log "ROLLED BACK，旧版本健康"; else echo "WARN: 旧版本回滚后本机健康检查仍未通过，人工介入"; fi
}

activate() {
  [ "$(cat "$rel/prepared" 2>/dev/null)" = "$SHA" ] || die "prepare has not succeeded"
  if [ -f "$STATE" ]; then
    if [ "$(state_get release)" = "$rel" ]; then
      [ "$(cur_phase)" = active ] && { log "already active"; return 0; }
      die "this release was already activated ($(cur_phase)); start a new run"
    fi
    [ "$(cur_phase)" != activating ] || die "an earlier activation never finished ($(state_get release)); run its rollback first"
  fi
  printf 'release=%s\nprev_head=%s\nprev_web=%s\nphase=activating\n' \
    "$rel" "$(git rev-parse HEAD)" "$(readlink public/web 2>/dev/null || true)" > "$STATE.tmp"
  mv "$STATE.tmp" "$STATE"
  trap 'echo "PROMOTE-ERROR: activate failed at line $LINENO"; trap - ERR; set +e; rollback; exit 1' ERR

  log "快进 checkout 到 ${SHA}（只 merge --ff-only）"
  git checkout -- package-lock.json 2>/dev/null || true
  step_done git
  git merge --ff-only --quiet "$SHA"
  [ "$(git rev-parse HEAD)" = "$SHA" ]

  log "原子安装 Web 工作台产物"
  step_done web
  node scripts/web-install-artifact.mjs "$rel/web" "$SHA-${WEB_TAR_SHA256:0:16}" "$SHA"

  # 幂等、只增不覆盖；放在换入前，缩短旧进程读到新 .next 的窗口
  node scripts/seed.mjs

  # 并入上一代静态 chunk，防旧标签页 404（同 deploy-build-swap.sh，dev-board#324）
  if [ -d .next/static ]; then rsync -a --ignore-existing .next/static/ "$rel/bundle/.next/static/"; fi
  find "$rel/bundle/.next/static" -type f -mtime +30 -delete 2>/dev/null || true

  log "换入 .next 与 node_modules（上一份留在 .next-old / .node_modules-old）"
  rm -rf .next-old .node_modules-old
  step_done next
  if [ -d .next ]; then mv .next .next-old; fi
  mv "$rel/bundle/.next" .next
  step_done deps
  if [ -d node_modules ]; then mv node_modules .node_modules-old; fi
  mv "$rel/deps/node_modules" node_modules
  step_done restart
  pm2 restart "$PM2_NAME" --update-env

  log "本机健康检查"
  local_health || { echo "PROMOTE-ERROR: local health failed"; trap - ERR; set +e; rollback; exit 1; }
  trap - ERR
  echo "phase=active" >> "$STATE"
  rm -rf "$rel/bundle" "$rel/deps" "$rel"/*.tar.gz
  log "PROMOTED $SHA"
}

case "$cmd" in
  prepare) prepare ;;
  activate) activate ;;
  rollback) rollback ;;
esac
