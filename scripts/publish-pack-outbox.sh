#!/usr/bin/env bash
#
# 把审核通过的原生资源包从发布 outbox 上架到静态镜像目录。
# 契约见桌面仓 docs/NATIVE_PACK_DISTRIBUTION.md §3.1 / §8.3。
#
# 为什么上架不在官网应用里做：审核通过 ≠ 立即上架。后台 approve 只做两件事——
# 补 publishedAt 并对 manifest 定稿字节签名、把发布件落到 data/pack-publish/
# （outbox）。真正让全世界能下载的那一步是本脚本，由维护者在服务器上手工执行，
# 发布节奏完全握在平台手里。
#
# 用法：
#   scripts/publish-pack-outbox.sh <id> <version> [选项]
#
#   --check               只验产物不落地（本地自检用，不碰目标目录）
#   --outbox <dir>        发布件来源，默认 <仓库>/data/pack-publish
#   --dest <dir>          镜像根目录，默认 /www/wwwroot/plugin-packs
#
# 例：
#   scripts/publish-pack-outbox.sh acme-fonts 1.0.0 --check
#   sudo scripts/publish-pack-outbox.sh acme-fonts 1.0.0
#
# 幂等：目标版本目录已存在时逐文件比对 sha256，一致则跳过落地、继续切指针；
# 不一致直接报错退出（版本目录是 immutable 的，内容变了说明有人搞错了版本号）。
#
# 新加坡镜像：本脚本只管**本机**。SG 侧按 lowa-engine 的惯例用 sg_to_bj 密钥
# 从北京拉取同一份目录，拉完在 SG 上再跑一次本脚本（--dest 相同）即可。
# **两台都验证过才切指针**——只传一台就切，另一台会给客户端 404
# （lowa r4 已经踩过一次）。
#
# 依赖 python3（读 manifest）与 sha256sum/shasum，两台服务器都自带。
set -euo pipefail

usage() { sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

[ $# -ge 2 ] || usage
PACK_ID="$1"; shift
VERSION="$1"; shift

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTBOX="$REPO_ROOT/data/pack-publish"
DEST="/www/wwwroot/plugin-packs"
CHECK_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1; shift ;;
    --outbox) OUTBOX="$2"; shift 2 ;;
    --dest) DEST="$2"; shift 2 ;;
    *) echo "未知参数：$1" >&2; usage ;;
  esac
done

SRC="$OUTBOX/$PACK_ID/$VERSION"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}';
  else shasum -a 256 "$1" | awk '{print $1}'; fi
}

# manifest 里的组件清单：一行一个 "archive<TAB>size<TAB>sha256"
read_components() {
  python3 - "$1" <<'PY'
import json, sys
with open(sys.argv[1], 'rb') as f:
    m = json.load(f)
for c in m['components']:
    print('%s\t%d\t%s' % (c['archive'], c['size'], c['sha256']))
PY
}

manifest_field() {
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1], 'rb') as f:
    m = json.load(f)
print(m.get(sys.argv[2], ''))
PY
}

# 验一份产物目录：manifest 可解析、id/version 对得上、旁挂签名在、每个组件字节与哈希对账
verify_dir() {
  local dir="$1" label="$2"
  [ -f "$dir/manifest.json" ] || { echo "[$label] 缺 manifest.json" >&2; return 1; }
  [ -s "$dir/manifest.json.sig" ] || { echo "[$label] 缺 manifest.json.sig（或为空）" >&2; return 1; }

  local got_id got_version got_published
  got_id="$(manifest_field "$dir/manifest.json" id)"
  got_version="$(manifest_field "$dir/manifest.json" version)"
  got_published="$(manifest_field "$dir/manifest.json" publishedAt)"
  [ "$got_id" = "$PACK_ID" ] || { echo "[$label] manifest.id=$got_id，与参数 $PACK_ID 不符" >&2; return 1; }
  [ "$got_version" = "$VERSION" ] || { echo "[$label] manifest.version=$got_version，与参数 $VERSION 不符" >&2; return 1; }
  # publishedAt 是平台在审核通过时补的；空说明这不是发布件而是提交件
  [ -n "$got_published" ] || { echo "[$label] manifest 没有 publishedAt，这不是发布件" >&2; return 1; }

  local archive size sha actual_size actual_sha
  while IFS=$'\t' read -r archive size sha; do
    [ -f "$dir/$archive" ] || { echo "[$label] 缺组件归档 $archive" >&2; return 1; }
    actual_size="$(wc -c < "$dir/$archive" | tr -d ' ')"
    [ "$actual_size" = "$size" ] || { echo "[$label] $archive 字节数 $actual_size != manifest 声明 $size" >&2; return 1; }
    actual_sha="$(sha256_of "$dir/$archive")"
    [ "$actual_sha" = "$sha" ] || { echo "[$label] $archive 哈希不符" >&2; return 1; }
    echo "  ok  $archive  ($size 字节)"
  done < <(read_components "$dir/manifest.json")
  echo "[$label] 校验通过：$dir"
}

[ -d "$SRC" ] || { echo "发布件不存在：$SRC" >&2; exit 1; }

echo "== 校验发布件 =="
verify_dir "$SRC" outbox

if [ "$CHECK_ONLY" = 1 ]; then
  echo "== --check：只验不落地，结束 =="
  exit 0
fi

TARGET_DIR="$DEST/$PACK_ID/$VERSION"
mkdir -p "$DEST/$PACK_ID"

if [ -d "$TARGET_DIR" ]; then
  echo "== 目标版本目录已存在，逐文件比对（幂等重跑）=="
  for f in "$SRC"/*; do
    base="$(basename "$f")"
    [ -f "$TARGET_DIR/$base" ] || { echo "已上架的 $VERSION 缺 $base，请人工处置" >&2; exit 1; }
    [ "$(sha256_of "$f")" = "$(sha256_of "$TARGET_DIR/$base")" ] || {
      echo "已上架的 $VERSION 与发布件不一致（$base）。版本目录是不可变的——" >&2
      echo "内容变了就该发新版本号，不要覆盖。" >&2
      exit 1
    }
  done
  echo "  内容一致，跳过落地"
else
  # 先落到同一父目录下的暂存名再 mv：同文件系统内 rename 是原子的，
  # 客户端不会看到「目录已出现但文件只传了一半」的中间态。
  STAGING="$DEST/$PACK_ID/.incoming-$VERSION.$$"
  rm -rf "$STAGING"
  mkdir -p "$STAGING"
  trap 'rm -rf "$STAGING"' EXIT
  cp -p "$SRC"/* "$STAGING/"
  echo "== 校验落地件 =="
  verify_dir "$STAGING" staging
  mv "$STAGING" "$TARGET_DIR"
  trap - EXIT
  echo "  已落地：$TARGET_DIR"
fi

echo "== 终验落地件 =="
verify_dir "$TARGET_DIR" published

# 指针最后切：<id>/manifest.json 指向最新版。同样 tmp + mv，
# 避免客户端读到半截 JSON 或读到与 .sig 对不上的中间态。
# 先切 .sig 再切 manifest：反过来的话有一瞬间新 manifest 配着旧签名，验签必失败。
echo "== 切最新版指针 =="
cp -p "$TARGET_DIR/manifest.json.sig" "$DEST/$PACK_ID/.manifest.json.sig.tmp"
mv -f "$DEST/$PACK_ID/.manifest.json.sig.tmp" "$DEST/$PACK_ID/manifest.json.sig"
cp -p "$TARGET_DIR/manifest.json" "$DEST/$PACK_ID/.manifest.json.tmp"
mv -f "$DEST/$PACK_ID/.manifest.json.tmp" "$DEST/$PACK_ID/manifest.json"

echo "完成：$PACK_ID v$VERSION 已上架到 $DEST"
echo "提醒：另一台镜像也要跑一遍本脚本，两台都验过再对外宣布。"
