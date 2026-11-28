#!/usr/bin/env python3
"""Read-only Google Search Console monitor (URL Inspection API + Search Analytics API).

* Read-only: uses the webmasters.readonly scope. Never calls the Indexing API and never
  submits URLs. Index requests for normal pages are made by a person in the Search Console UI.
* Private: results are written ONLY to --out-dir, which must be outside the repository
  checkout. Stdout carries operation counts only, never URLs' index state or search data,
  because Actions logs of a public repository are public.
* Free: both APIs are quota-limited, not billed.

Auth: an OAuth access token in the GSC_ACCESS_TOKEN environment variable (the workflow gets
it from google-github-actions/auth). Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable
from urllib.parse import quote, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import USER_AGENT, indexable_urls, load_config  # noqa: E402

INSPECT_ENDPOINT = "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect"
ANALYTICS_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3/sites/{site}/searchAnalytics/query"
ALLOWED_HOSTS = {"searchconsole.googleapis.com"}
JST = timezone(timedelta(hours=9))

PostJson = Callable[[str, dict], dict]


class ApiError(Exception):
    def __init__(self, status: int | None, reason: str):
        super().__init__(f"{status} {reason}")
        self.status = status
        self.reason = reason


def make_post_json(token: str, timeout: float = 30.0) -> PostJson:
    def post_json(url: str, body: dict) -> dict:
        host = urlsplit(url).netloc
        if host not in ALLOWED_HOSTS:  # hard guard: e.g. indexing.googleapis.com is never allowed
            raise ApiError(None, f"blocked host {host}")
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "User-Agent": USER_AGENT,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as exc:
            reason = "error"
            try:
                reason = json.loads(exc.read().decode("utf-8"))["error"]["status"]
            except Exception:
                pass
            raise ApiError(exc.code, reason) from None
        except Exception as exc:
            raise ApiError(None, type(exc).__name__) from None

    return post_json


# ---------------------------------------------------------------- dates
def comparison_periods(today: date, windows: list[int], lag: int) -> dict[int, dict]:
    end = today - timedelta(days=lag)
    out = {}
    for n in windows:
        cur_start = end - timedelta(days=n - 1)
        prev_end = cur_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=n - 1)
        out[n] = {
            "current": (cur_start.isoformat(), end.isoformat()),
            "previous": (prev_start.isoformat(), prev_end.isoformat()),
        }
    return out


# ---------------------------------------------------------------- keywords
def normalize(text: str) -> str:
    t = unicodedata.normalize("NFKC", text).lower()
    return "".join(t.split())


def keyword_matchers(keyword: str) -> tuple[str, list[str], str]:
    """Return (exact_norm, area_alternatives, intent) for 'エリア 意図' style keywords."""
    parts = unicodedata.normalize("NFKC", keyword).split()
    intent = parts[-1] if len(parts) > 1 else ""
    area = " ".join(parts[:-1]) if len(parts) > 1 else keyword
    alts = {normalize(area), normalize(area.replace("・", ""))}
    alts.update(normalize(a) for a in area.split("・") if a.strip())
    return normalize(keyword), sorted(a for a in alts if a), normalize(intent)


def match_kind(query: str, matcher: tuple[str, list[str], str]) -> str | None:
    exact, alts, intent = matcher
    q = normalize(query)
    if q == exact or q == exact.replace("・", ""):
        return "exact"
    if intent and intent in q and any(a in q for a in alts):
        return "related"
    return None


def load_keywords(path: Path, kw_col: str, url_col: str) -> list[dict]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))
    out, seen = [], set()
    for r in rows:
        kw = (r.get(kw_col) or "").strip()
        if kw and kw not in seen:
            seen.add(kw)
            out.append({"keyword": kw, "url": (r.get(url_col) or "").strip(), "spot": (r.get("ポイント名") or "").strip()})
    return out


def _agg(rows: list[dict]) -> dict:
    clicks = sum(r.get("clicks", 0) for r in rows)
    impr = sum(r.get("impressions", 0) for r in rows)
    pos = (sum(r.get("position", 0) * r.get("impressions", 0) for r in rows) / impr) if impr else None
    return {"clicks": clicks, "impressions": impr, "ctr": (clicks / impr) if impr else None, "position": pos}


def keyword_metrics(keywords: list[dict], query_rows: list[dict]) -> list[dict]:
    out = []
    for kw in keywords:
        m = keyword_matchers(kw["keyword"])
        exact, related = [], []
        for r in query_rows:
            kind = match_kind(r["keys"][0], m)
            if kind == "exact":
                exact.append(r)
                related.append(r)
            elif kind == "related":
                related.append(r)
        out.append({**kw, "exact": _agg(exact), "related": _agg(related), "related_queries": len(related)})
    return out


# ---------------------------------------------------------------- API calls
def search_analytics(post: PostJson, prop: str, start: str, end: str, dims: list[str], limit: int) -> list[dict]:
    url = ANALYTICS_ENDPOINT.format(site=quote(prop, safe=""))
    body = {"startDate": start, "endDate": end, "type": "web", "dataState": "final", "rowLimit": limit}
    if dims:
        body["dimensions"] = dims
    return post(url, body).get("rows", [])


def inspect_url(post: PostJson, prop: str, url: str) -> dict:
    res = post(INSPECT_ENDPOINT, {"inspectionUrl": url, "siteUrl": prop, "languageCode": "ja"})
    s = res.get("inspectionResult", {}).get("indexStatusResult", {})
    return {
        "url": url,
        "verdict": s.get("verdict"),
        "coverage_state": s.get("coverageState"),
        "indexing_state": s.get("indexingState"),
        "robots_txt_state": s.get("robotsTxtState"),
        "page_fetch_state": s.get("pageFetchState"),
        "google_canonical": s.get("googleCanonical"),
        "user_canonical": s.get("userCanonical"),
        "last_crawl_time": s.get("lastCrawlTime"),
        "crawled_as": s.get("crawledAs"),
        "in_sitemaps": s.get("sitemap", []),
    }


def console_inspect_link(prop: str, url: str) -> str:
    return f"https://search.google.com/search-console/inspect?resource_id={quote(prop, safe='')}&id={quote(url, safe='')}"


def run_monitor(cfg: dict, post: PostJson, today: date, keywords: list[dict] | None) -> dict:
    prop = cfg["gsc_property"]
    errors: list[dict] = []
    inspections = []
    for url in indexable_urls(cfg):
        try:
            inspections.append(inspect_url(post, prop, url))
        except ApiError as exc:
            errors.append({"op": "urlInspection", "url": url, "status": exc.status, "reason": exc.reason})
            inspections.append({"url": url, "verdict": None, "error": f"{exc.status} {exc.reason}"})
    not_indexed = [
        {**i, "console_link": console_inspect_link(prop, i["url"])}
        for i in inspections
        if i.get("verdict") != "PASS" and not i.get("error")
    ]

    spot_urls = {s["url"]: s["name"] for s in cfg["spot_pages"]}
    periods = comparison_periods(today, cfg.get("comparison_windows_days", [7, 28, 90]), cfg.get("gsc_data_lag_days", 3))
    performance = {}
    for n, p in periods.items():
        entry = {"current_range": p["current"], "previous_range": p["previous"]}
        for label in ("current", "previous"):
            start, end = p[label]
            try:
                totals = search_analytics(post, prop, start, end, [], 1)
                pages = search_analytics(post, prop, start, end, ["page"], 1000)
                queries = search_analytics(post, prop, start, end, ["query"], 25000)
            except ApiError as exc:
                errors.append({"op": "searchAnalytics", "window": n, "period": label, "status": exc.status, "reason": exc.reason})
                entry[label] = None
                continue
            entry[label] = {
                "totals": _agg(totals),
                "spots": {u: _agg([r for r in pages if r["keys"][0] == u]) for u in spot_urls},
                "keywords": keyword_metrics(keywords, queries) if keywords is not None else None,
                "query_rows": len(queries),
            }
        performance[n] = entry

    return {
        "site_id": cfg["site_id"],
        "property": prop,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inspections": inspections,
        "not_indexed": not_indexed,
        "performance": performance,
        "keywords_loaded": keywords is not None,
        "errors": errors,
    }


# ---------------------------------------------------------------- output
def _fmt_num(v) -> str:
    return "-" if v is None else f"{v:,}"


def _fmt_pos(v) -> str:
    return "-" if v is None else f"{v:.1f}"


def _fmt_ctr(v) -> str:
    return "-" if v is None else f"{v * 100:.1f}%"


def _delta(cur, prev) -> str:
    if cur is None or prev is None:
        return "-"
    d = cur - prev
    return f"{d:+,}" if isinstance(d, int) else f"{d:+.1f}"


def to_markdown(report: dict, cfg: dict) -> str:
    spot_names = {s["url"]: s["name"] for s in cfg["spot_pages"]}
    ins = report["inspections"]
    indexed = [i for i in ins if i.get("verdict") == "PASS"]
    spot_indexed = [i for i in indexed if i["url"] in spot_names]
    L = [
        f"# Search Console 監視レポート（非公開）— {cfg.get('site_name', report['site_id'])}",
        "",
        f"生成(UTC): {report['generated_at']} / プロパティ: {report['property']}",
        "",
        "> このファイルは非公開データです。公開リポジトリ・Issue・SNSに貼らないでください。",
        "",
        "## 1. インデックス登録状況（URL検査API）",
        "",
        f"- 登録済み（verdict=PASS）: **{len(indexed)} / {len(ins)}**　うち9地点: **{len(spot_indexed)} / {len(spot_names)}**",
        "- 「PASS以外」は未登録の可能性があります。API取得値はGoogle側の集計時点のもので、登録を保証するものではありません。",
        "",
        "| ページ | 判定 | カバレッジ | 最終クロール | Google選択canonical |",
        "|---|---|---|---|---|",
    ]
    for i in ins:
        name = spot_names.get(i["url"], i["url"])
        if i.get("error"):
            L.append(f"| {name} | 取得失敗 | {i['error']} | - | - |")
            continue
        gcanon = i.get("google_canonical") or "-"
        if gcanon not in ("-", i["url"]):
            gcanon = f"⚠️ {gcanon}"
        L.append(f"| {name} | {i.get('verdict')} | {i.get('coverage_state') or '-'} | {i.get('last_crawl_time') or '-'} | {gcanon} |")

    L += ["", "## 2. 未登録ページ（手動の登録リクエスト候補）", ""]
    if report["not_indexed"]:
        L += [
            "登録リクエストは **Search Console の正規画面（URL検査 →「インデックス登録をリクエスト」）から本人が実施** してください。",
            "このシステムはリクエストを送信しません。「リクエスト受理」と「登録完了」は別物です。",
            "",
        ]
        for i in report["not_indexed"]:
            L.append(f"- {spot_names.get(i['url'], i['url'])}: {i.get('coverage_state') or i.get('verdict')}"
                     f"（robots: {i.get('robots_txt_state') or '-'} / 取得: {i.get('page_fetch_state') or '-'}）")
            L.append(f"  - [Search Consoleで検査を開く]({i['console_link']})")
    else:
        L.append("未登録として抽出されたページはありません。")

    L += ["", "## 3. 検索実績（ウェブ検索・前期間比較）", "",
          "| 期間 | 範囲 | クリック | 前期比 | 表示回数 | 前期比 | CTR | 平均順位 | 前期比 |",
          "|---|---|---|---|---|---|---|---|---|"]
    perf = report["performance"]
    for n, e in perf.items():
        cur, prev = e.get("current"), e.get("previous")
        if not cur:
            L.append(f"| {n}日 | {e['current_range'][0]}〜{e['current_range'][1]} | 取得失敗 | | | | | | |")
            continue
        c, p = cur["totals"], (prev or {}).get("totals", {})
        L.append(
            f"| {n}日 | {e['current_range'][0]}〜{e['current_range'][1]} | {_fmt_num(c['clicks'])} | {_delta(c['clicks'], p.get('clicks'))} "
            f"| {_fmt_num(c['impressions'])} | {_delta(c['impressions'], p.get('impressions'))} | {_fmt_ctr(c['ctr'])} "
            f"| {_fmt_pos(c['position'])} | {_delta(c['position'], p.get('position'))} |"
        )
    L += ["", "平均順位の前期比はマイナスが改善です。", "", "### 9地点ページ別", "",
          "| 地点 | " + " | ".join(f"{n}日 表示/クリック/順位" for n in perf) + " |",
          "|---|" + "---|" * len(perf)]
    for url, name in spot_names.items():
        cells = []
        for e in perf.values():
            s = (e.get("current") or {}).get("spots", {}).get(url)
            cells.append("-" if not s else f"{_fmt_num(s['impressions'])} / {_fmt_num(s['clicks'])} / {_fmt_pos(s['position'])}")
        L.append(f"| {name} | " + " | ".join(cells) + " |")

    L += ["", "## 4. 重点キーワード", ""]
    if not report["keywords_loaded"]:
        L.append("キーワード表（config の keywords_csv）が見つからないため未集計です。")
    else:
        L += [
            "完全一致＝そのままの検索語。関連＝地点名（「・」区切りのどれか）と意図語の両方を含む検索語の合計。",
            "Googleは件数の少ない検索語を匿名化するため、表示回数が少ない段階では「-」が多くなります。",
            "",
            "| キーワード | " + " | ".join(f"{n}日 完全一致 表示/順位" for n in perf) + " | 28日 関連 表示/クリック |",
            "|---|" + "---|" * (len(perf) + 1),
        ]
        first = next((e.get("current") for e in perf.values() if e.get("current")), None)
        kw_list = first["keywords"] if first and first.get("keywords") is not None else []
        for idx, kw in enumerate(kw_list):
            cells = []
            for e in perf.values():
                k = ((e.get("current") or {}).get("keywords") or [None] * (idx + 1))[idx]
                cells.append("-" if not k or not k["exact"]["impressions"] else f"{_fmt_num(k['exact']['impressions'])} / {_fmt_pos(k['exact']['position'])}")
            r28 = ((perf.get(28, {}).get("current") or {}).get("keywords") or [None] * (idx + 1))[idx]
            rel = "-" if not r28 or not r28["related"]["impressions"] else f"{_fmt_num(r28['related']['impressions'])} / {_fmt_num(r28['related']['clicks'])}"
            L.append(f"| {kw['keyword']} | " + " | ".join(cells) + f" | {rel} |")

    if report["errors"]:
        L += ["", "## 5. 取得エラー", ""]
        for e in report["errors"]:
            L.append(f"- {e['op']} {e.get('url') or ''} {e.get('window') or ''} {e.get('period') or ''}: {e['status']} {e['reason']}")
    return "\n".join(L) + "\n"


def keyword_csv(report: dict) -> str:
    """Per-keyword metrics in a flat CSV (for updating the tracking sheet by hand)."""
    import io

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ポイント名", "キーワード", "対象URL", "期間(日)", "期間開始", "期間終了", "一致", "表示回数", "クリック数", "CTR", "平均掲載順位", "前期間 表示回数", "前期間 平均掲載順位"])
    for n, e in report["performance"].items():
        cur, prev = e.get("current"), e.get("previous")
        if not cur or cur.get("keywords") is None:
            continue
        prev_kw = (prev or {}).get("keywords") or [None] * len(cur["keywords"])
        for k, pk in zip(cur["keywords"], prev_kw):
            for kind in ("exact", "related"):
                m, pm = k[kind], (pk or {}).get(kind, {})
                w.writerow([k["spot"], k["keyword"], k["url"], n, e["current_range"][0], e["current_range"][1],
                            "完全一致" if kind == "exact" else "関連", m["impressions"], m["clicks"],
                            "" if m["ctr"] is None else round(m["ctr"], 4),
                            "" if m["position"] is None else round(m["position"], 2),
                            pm.get("impressions", ""), "" if pm.get("position") is None else round(pm["position"], 2)])
    return buf.getvalue()


def ensure_outside_repo(out_dir: Path) -> None:
    out = out_dir.resolve()
    for root in filter(None, [os.environ.get("GITHUB_WORKSPACE"), str(Path(__file__).resolve().parents[2])]):
        r = Path(root).resolve()
        if out == r or r in out.parents:
            raise SystemExit("::error::--out-dir はリポジトリの外を指定してください（非公開データ保護）")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--config", default="config/seo-monitor.json")
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args(argv)
    out_dir = Path(args.out_dir)
    ensure_outside_repo(out_dir)
    token = os.environ.get("GSC_ACCESS_TOKEN", "").strip()
    if not token:
        print("::error::GSC_ACCESS_TOKEN がありません")
        return 2
    cfg = load_config(args.config)
    kw_path = Path(cfg.get("keywords_csv", ""))
    keywords = None
    if kw_path.is_file():
        keywords = load_keywords(kw_path, cfg.get("keyword_column", "キーワード"), cfg.get("keyword_url_column", "対象URL"))
    else:
        print(f"::warning::キーワード表 {kw_path} がないためキーワード集計をスキップします")

    report = run_monitor(cfg, make_post_json(token), datetime.now(JST).date(), keywords)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "gsc-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "gsc-report.md").write_text(to_markdown(report, cfg), encoding="utf-8")
    if keywords is not None:
        (out_dir / "keyword-metrics.csv").write_text(keyword_csv(report), encoding="utf-8-sig")

    # Public-safe stdout: counts of operations only.
    n_ops = len(report["inspections"]) + 3 * 2 * len(report["performance"])
    print(f"GSC読み取り: 実行 {n_ops} 件 / 失敗 {len(report['errors'])} 件（結果は非公開ファイルのみに保存）")
    for e in report["errors"]:
        # Status codes only: no URL index state or search data.
        print(f"::error title=GSC API::{e['op']} が失敗しました (HTTP {e['status']} {e['reason']})")
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
