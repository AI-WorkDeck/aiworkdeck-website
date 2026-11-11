#!/usr/bin/env bash
#
# 国际站（新加坡 8.219.94.204）从国内站（北京 8.152.169.44）镜像插件 registry。
#
# 为什么必须镜像而不是各签各的：插件签名私钥（AWD_PLUGIN_SIGNING_KEY）**只在北京**，
# 桌面端内置的验签公钥两站共用（见记忆 dual-site-architecture「不分的」）。国际站没有
# 私钥，approvePlugin 会以 signing_not_configured 失败——所以它**不能自己上架插件**，
# 只能拿北京已签名的产物来服务。北京是插件目录的唯一真源。
#
# 「registry 落点分」指的是各站自服务一份、无运行时跨站依赖（不是内容要不同）：
# 目录内容两站一致，本脚本把北京的签名产物同步到本机 data/ 下由本站 /api/registry 直出。
#
# 同步两样（顺序不可换，与 update-mirror-sync 同理——清单最后落，客户端永远不会
# 拿到指向尚未就位字节的 plugins.json）：
#   1. data/plugin-files/**            插件签名字节（jar / manifest / skills）
#   2. data/plugins.json               目录清单（含每条 signature/publishedAt/files 哈希）
#
# registry 路由是 force-dynamic、每次请求现读 fs，同步完无需 pm2 restart。
#
# 用法（在新加坡 ECS 上跑；BatchMode 走 sg_to_bj 密钥回北京拉）：
#   bash scripts/sync-plugins-from-bj.sh
#   挂 cron 每小时一次（幂等，rsync 只传变化）。
#
# 注意：本脚本**单向覆盖** data/plugins.json（北京是真源）。国际站不要手工往
# plugins.json 塞条目——下次同步会被盖掉，且没私钥也签不了。

set -euo pipefail

BJ_HOST="${BJ_HOST:-8.152.169.44}"
BJ_KEY="${BJ_KEY:-$HOME/.ssh/sg_to_bj}"
BJ_DATA="${BJ_DATA:-/www/wwwroot/www.aiworkdeck.com/new/data}"
APP_DATA="${APP_DATA:-/www/wwwroot/workdeck.ai/app/data}"

SSH_CMD="ssh -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 -i $BJ_KEY"
log() { echo "[plugin-mirror] $*"; }

log "run at $(date '+%Y-%m-%d %H:%M:%S')  BJ=$BJ_HOST -> $APP_DATA"
mkdir -p "$APP_DATA/plugin-files"

# 1) 先拉签名字节。rsync 不删本地多出来的（国际站曾手工放过什么也不误删），
#    只保证北京有的这里都有、且字节一致。
rsync -az --timeout=60 -e "$SSH_CMD" \
  "root@$BJ_HOST:$BJ_DATA/plugin-files/" "$APP_DATA/plugin-files/"
log "plugin-files synced"

# 2) 再拉清单，落到临时文件后原子替换（rename 同分区原子；避免半截 JSON 被读到）。
TMP="$APP_DATA/.plugins.json.tmp.$$"
if rsync -az --timeout=60 -e "$SSH_CMD" \
     "root@$BJ_HOST:$BJ_DATA/plugins.json" "$TMP"; then
  # 落地前先确认是合法 JSON，别把半截/空文件换上去
  if node -e "JSON.parse(require('fs').readFileSync('$TMP','utf8'))" 2>/dev/null; then
    mv -f "$TMP" "$APP_DATA/plugins.json"
    log "plugins.json updated ($(node -e "console.log(JSON.parse(require('fs').readFileSync('$APP_DATA/plugins.json','utf8')).length)" 2>/dev/null || echo '?') 条)"
  else
    rm -f "$TMP"; log "ERROR: 拉到的 plugins.json 不是合法 JSON，保留旧清单"; exit 1
  fi
else
  rm -f "$TMP"; log "ERROR: plugins.json 拉取失败，保留旧清单"; exit 1
fi

log "done"
