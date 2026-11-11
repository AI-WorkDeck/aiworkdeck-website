#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 北京京微资易科技有限公司 and AI WorkDeck contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
# Read-only checks; no AI request, credentials, or user documents.
set -euo pipefail
host="${1:?host}"; ip="${2:?origin IP}"; revision="${3:?git SHA}"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
for page in /web/ /web/editor/editor.html; do
  curl --fail --silent --show-error --location --max-redirs 5 --cookie awd_site=intl --max-time 30 --resolve "$host:443:$ip" \
    -D "$scratch/headers" -o "$scratch/body" "https://$host$page"
  node - "$scratch/headers" <<'NODE'
const fs = require('node:fs');
const headers = fs.readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n\r?\n/).at(-1).toLowerCase();
for (const [name, value] of [['cross-origin-opener-policy','same-origin'], ['cross-origin-embedder-policy','require-corp']]) {
  if (!new RegExp('^' + name + ':\\s*' + value + '\\s*$', 'm').test(headers)) throw Error('Missing isolation header: ' + name);
}
if (!/^http\/[^ ]+ 200\b/m.test(headers)) throw Error('Final Web response failed');
NODE
done
curl --fail --silent --show-error --location --max-redirs 5 --cookie awd_site=intl --max-time 30 --resolve "$host:443:$ip" \
  "https://$host/web/release-manifest.json" -o "$scratch/manifest"
node - "$scratch/manifest" "$revision" <<'NODE'
const manifest = JSON.parse(require('node:fs').readFileSync(process.argv[2], 'utf8'));
if (manifest.revision !== process.argv[3]) throw Error('Wrong Web release served');
NODE
for asset in soffice.wasm soffice.data; do
  curl --fail --silent --show-error --location --max-redirs 5 --cookie awd_site=intl --head --max-time 30 --resolve "$host:443:$ip" \
    "https://$host/web/editor/lowa/$asset" -o "$scratch/headers"
  node - "$scratch/headers" "$asset" <<'NODE'
const headers = require('node:fs').readFileSync(process.argv[2], 'utf8').trim().split(/\r?\n\r?\n/).at(-1).toLowerCase();
if (!/^http\/[^ ]+ 200\b/m.test(headers) || !/^content-encoding:\s*br\s*$/m.test(headers)) throw Error('Compressed engine response is invalid');
if (process.argv[3].endsWith('.wasm') && !/^content-type:\s*application\/wasm\b/m.test(headers)) throw Error('Wrong WebAssembly MIME type');
NODE
done
echo "Web artifact $revision and isolation/engine headers verified on $host"
