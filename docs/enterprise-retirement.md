# Enterprise retirement — 2026-11-04

Owner instruction: retire the independent Enterprise product entirely, including its update bots (dev-board#1705). This supersedes older enterprise design, import and release instructions. Ordinary website, account/team billing, Web workbench and user databases are retained.

The active `enterprise/` source, image workflow and CI job are removed. Dependabot and the dependency security gate cover only the website and Web workbench. Enterprise-only update PRs #357/#358 and superseded mixed PR #351 are closed. Historical source remains in Git; old supplier archives and branches must not be reimported as an active product.

Both website locales return notFound for retired enterprise bookmarks. `deploy/nginx/enterprise-retired.conf` returns 410 for the enterprise root, descendants and all 20 locale prefixes. International production uses this fragment at `/www/server/nginx/conf/awd-enterprise.conf` for workdeck.ai and aiworkdeck.us; normal website/API/Web routes remain unchanged. Mainland production installs the same fragment in the website nginx extension directory.

The three verified stateless Enterprise frontend containers on the international host were stopped and removed individually, without deleting volumes or images. Inspection records and the prior nginx fragment remain private under `/root/awd-retirement-1705`. Podman on this host does not support `docker update --restart`; removing these mount-free containers prevents automatic revival. Never use a broad Compose up/down or prune against the shared host: retained containers may share Compose labels.

Local cross-project searches found no automatic export into this directory. The initial imports were supplier archives (commits 8e92be6 and 8fd0638). Supplier-owned backend and desktop distribution are external to this repository; their shutdown has not been verified. No database deletion or supplier-side action was performed.
