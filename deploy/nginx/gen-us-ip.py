#!/usr/bin/env python3
"""生成美国 IPv4 网段清单，供 nginx geo 判断访客地域（workdeck.ai 美国访客 301 到 aiworkdeck.us 用）。

数据源 ipdeny 的按国家聚合清单（来自五家 RIR 的 delegated 记录，每日更新）。
写入前做健全性校验，源站抽风时保留旧清单。与 gen-china-ip.py 同一套路。
"""
import ipaddress
import subprocess
import sys

OUT = "/www/server/nginx/conf/us_ip.conf"
MUST_HIT = ["8.8.8.8", "66.249.66.1", "104.16.0.1"]        # Google DNS / Googlebot / Cloudflare（美国登记）
MUST_MISS = ["8.219.94.204", "8.152.169.44", "223.5.5.5"]  # 本机（新加坡）、北京 ECS、阿里 DNS


def fetch(url):
    return subprocess.check_output(
        ["curl", "-fsS", "--retry", "3", "--max-time", "120", url]
    ).decode()


text = fetch("https://www.ipdeny.com/ipblocks/data/aggregated/us-aggregated.zone")
nets = [ipaddress.ip_network(l.strip()) for l in text.splitlines()
        if l.strip() and not l.startswith("#")]
merged = list(ipaddress.collapse_addresses(nets))

if len(merged) < 5000:
    sys.exit(f"us_ip: 合并后只有 {len(merged)} 条，疑似数据源异常，保留旧清单")
for probe in MUST_HIT:
    ip = ipaddress.ip_address(probe)
    if not any(ip in n for n in merged):
        sys.exit(f"us_ip: 探针 {probe} 未命中，清单残缺，保留旧清单")
for probe in MUST_MISS:
    ip = ipaddress.ip_address(probe)
    if any(ip in n for n in merged):
        sys.exit(f"us_ip: 非美国探针 {probe} 命中，清单可疑，保留旧清单")

with open(OUT, "w") as f:
    for n in merged:
        f.write(f"{n} 1;\n")
print(f"us_ip: 已更新 {len(merged)} 条")
