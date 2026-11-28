#!/usr/bin/env python3
"""Public technical SEO audit: HTTP status, canonical, robots meta/header, robots.txt, sitemap.xml.

Everything checked here is publicly fetchable by anyone, so the report is safe to show in
public Actions logs and job summaries. No Search Console data is touched in this script.

Usage: python3 scripts/seo/technical_audit.py --config config/seo-monitor.json \
           --json-out audit.json --md-out audit.md
Exit code: 0 = no errors (warnings allowed), 1 = at least one error, 2 = bad config.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import urljoin, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import HttpResult, http_get, indexable_urls, load_config, parse_head  # noqa: E402

SITEMAP_NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
Fetch = Callable[[str], HttpResult]


class Findings:
    def __init__(self) -> None:
        self.items: list[dict] = []

    def add(self, level: str, check: str, url: str, message: str) -> None:
        self.items.append({"level": level, "check": check, "url": url, "message": message})

    def error(self, *a):
        self.add("error", *a)

    def warn(self, *a):
        self.add("warning", *a)

    def ok(self, *a):
        self.add("ok", *a)

    def count(self, level: str) -> int:
        return sum(1 for i in self.items if i["level"] == level)


def _status_text(r: HttpResult) -> str:
    return f"HTTP {r.status}" if r.status is not None else f"接続失敗 ({r.error})"


def audit_robots(cfg: dict, fetch: Fetch, f: Findings) -> urllib.robotparser.RobotFileParser | None:
    url = urljoin(cfg["base_url"], "/robots.txt")
    r = fetch(url)
    if r.status != 200:
        f.error("robots.txt", url, f"robots.txt が取得できません: {_status_text(r)}")
        return None
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(r.body.splitlines())
    expected_sitemap = urljoin(cfg["base_url"], "/sitemap.xml")
    sitemaps = rp.site_maps() or []
    if expected_sitemap in sitemaps:
        f.ok("robots.txt", url, "Sitemap 行あり")
    else:
        f.warn("robots.txt", url, f"Sitemap 行に {expected_sitemap} がありません")
    blocked = [u for u in indexable_urls(cfg) if not rp.can_fetch("Googlebot", u)]
    for u in blocked:
        f.error("robots.txt", u, "Googlebot がクロール禁止されています")
    if not blocked:
        f.ok("robots.txt", url, f"対象 {len(indexable_urls(cfg))} URL すべてクロール許可")
    return rp


def audit_sitemap(cfg: dict, fetch: Fetch, f: Findings) -> list[str]:
    url = urljoin(cfg["base_url"], "/sitemap.xml")
    r = fetch(url)
    if r.status != 200:
        f.error("sitemap.xml", url, f"sitemap.xml が取得できません: {_status_text(r)}")
        return []
    try:
        root = ET.fromstring(r.body.encode("utf-8"))
    except ET.ParseError as exc:
        f.error("sitemap.xml", url, f"XML として解析できません: {exc}")
        return []
    if root.tag == SITEMAP_NS + "sitemapindex":
        f.warn("sitemap.xml", url, "サイトマップインデックス形式です（子サイトマップは未展開）")
    locs = [(e.text or "").strip() for e in root.iter(SITEMAP_NS + "loc")]
    expected = indexable_urls(cfg)
    for u in expected:
        if u not in locs:
            f.error("sitemap.xml", u, "インデックス対象URLがサイトマップにありません")
    for u in locs:
        if u not in expected:
            f.warn("sitemap.xml", u, "設定にないURLがサイトマップに含まれています")
    for u in cfg.get("noindex_pages", []):
        if u in locs:
            f.error("sitemap.xml", u, "noindex ページがサイトマップに含まれています")
    base_host = urlsplit(cfg["base_url"]).netloc
    for u in locs:
        parts = urlsplit(u)
        if parts.scheme != "https" or parts.netloc != base_host:
            f.error("sitemap.xml", u, "https / 本番ホスト以外のURLです")
    if len(locs) != len(set(locs)):
        f.warn("sitemap.xml", url, "重複URLがあります")
    f.ok("sitemap.xml", url, f"{len(locs)} URL 掲載")
    return locs


def audit_page(url: str, fetch: Fetch, f: Findings, expect_index: bool = True) -> dict:
    r = fetch(url)
    page = {"url": url, "status": r.status, "canonical": None, "robots": None}
    if r.status != 200:
        detail = _status_text(r)
        loc = r.header("location")
        if loc:
            detail += f" → {loc}"
        f.error("http", url, f"HTTP 200 ではありません: {detail}")
        return page
    canonicals, metas = parse_head(r.body)
    header_robots = r.header("x-robots-tag").lower()
    robots_all = " ".join(metas + [header_robots])
    page["canonical"] = canonicals[0] if canonicals else None
    page["robots"] = robots_all.strip() or None
    has_noindex = "noindex" in robots_all or "none" in robots_all.replace(",", " ").split()
    if expect_index:
        if len(canonicals) == 0:
            f.error("canonical", url, "canonical がありません")
        elif len(canonicals) > 1:
            f.error("canonical", url, f"canonical が複数あります: {canonicals}")
        elif canonicals[0] != url:
            f.error("canonical", url, f"自己参照ではありません: {canonicals[0]}")
        if has_noindex:
            src = "X-Robots-Tag" if "noindex" in header_robots else "meta robots"
            f.error("robots", url, f"noindex が指定されています（{src}）")
        if not any(e["url"] == url and e["level"] == "error" for e in f.items):
            f.ok("page", url, "200 / 自己canonical / index可")
    else:
        if has_noindex:
            f.ok("page", url, "noindex 確認")
        else:
            f.warn("robots", url, "noindex 想定ページに noindex がありません")
    return page


def audit_probes(cfg: dict, fetch: Fetch, f: Findings) -> None:
    probe = cfg.get("not_found_probe")
    if probe:
        r = fetch(probe)
        if r.status == 404:
            f.ok("404", probe, "存在しないURLは 404")
        else:
            f.warn("404", probe, f"存在しないURLが 404 になりません: {_status_text(r)}（ソフト404の可能性）")
    http_probe = cfg.get("http_to_https_probe")
    if http_probe:
        r = fetch(http_probe)
        loc = r.header("location")
        if r.status in (301, 308) and loc.startswith("https://"):
            f.ok("https", http_probe, f"{r.status} → {loc}")
        else:
            f.warn("https", http_probe, f"HTTP→HTTPS 恒久リダイレクトになっていません: {_status_text(r)} {loc}")


def run_audit(cfg: dict, fetch: Fetch = http_get) -> dict:
    f = Findings()
    audit_robots(cfg, fetch, f)
    locs = audit_sitemap(cfg, fetch, f)
    pages = [audit_page(u, fetch, f) for u in indexable_urls(cfg)]
    for u in cfg.get("noindex_pages", []):
        pages.append(audit_page(u, fetch, f, expect_index=False))
    audit_probes(cfg, fetch, f)
    return {
        "site_id": cfg["site_id"],
        "base_url": cfg["base_url"],
        "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sitemap_url_count": len(locs),
        "pages": pages,
        "findings": f.items,
        "errors": f.count("error"),
        "warnings": f.count("warning"),
    }


def to_markdown(report: dict, cfg: dict) -> str:
    icon = {"error": "❌", "warning": "⚠️", "ok": "✅"}
    lines = [
        f"## 技術SEO監査 — {cfg.get('site_name', report['site_id'])}",
        "",
        f"- 対象: {report['base_url']}　確認時刻(UTC): {report['checked_at']}",
        f"- 結果: エラー **{report['errors']}** / 警告 **{report['warnings']}** / サイトマップ掲載 {report['sitemap_url_count']} URL",
        "",
        "| 判定 | 項目 | URL | 内容 |",
        "|---|---|---|---|",
    ]
    order = {"error": 0, "warning": 1, "ok": 2}
    for item in sorted(report["findings"], key=lambda i: order[i["level"]]):
        msg = item["message"].replace("|", "\\|")
        lines.append(f"| {icon[item['level']]} | {item['check']} | {item['url']} | {msg} |")
    spot_names = {s["url"]: s["name"] for s in cfg["spot_pages"]}
    lines += ["", "### 9地点ページ", "", "| 地点 | HTTP | canonical | robots |", "|---|---|---|---|"]
    for p in report["pages"]:
        if p["url"] in spot_names:
            ok_canon = "自己参照" if p["canonical"] == p["url"] else (p["canonical"] or "なし")
            lines.append(f"| {spot_names[p['url']]} | {p['status']} | {ok_canon} | {p['robots'] or '-'} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default="config/seo-monitor.json")
    ap.add_argument("--json-out")
    ap.add_argument("--md-out")
    args = ap.parse_args(argv)
    try:
        cfg = load_config(args.config)
    except Exception as exc:
        print(f"::error::設定エラー: {exc}")
        return 2
    report = run_audit(cfg)
    md = to_markdown(report, cfg)
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.md_out:
        Path(args.md_out).write_text(md, encoding="utf-8")
    print(md)
    for item in report["findings"]:
        if item["level"] == "error":
            print(f"::error title=SEO {item['check']}::{item['url']} {item['message']}")
        elif item["level"] == "warning":
            print(f"::warning title=SEO {item['check']}::{item['url']} {item['message']}")
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
