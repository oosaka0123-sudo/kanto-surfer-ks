#!/usr/bin/env python3
"""Read-only Google Search Console monitor (URL Inspection API + Search Analytics API).

* Read-only: uses the webmasters.readonly scope. Never calls the Indexing API and never
  submits URLs. Index requests for normal pages are made by a person in the Search Console UI.
* Private: results are written ONLY to --out-dir, which must be outside the repository
  checkout. Stdout and --status-out carry states and counts only (no URL index state, no
  search data), because Actions logs of a public repository are public.
* Free: both APIs are quota-limited, not billed.
* Robust: transient errors (429/5xx/network) are retried with backoff; malformed responses
  are treated as errors, never as "no data". Unknown index state is never reported as
  "not indexed", and missing search rows are reported as "no data", never as zero.

Auth: an OAuth access token in GSC_ACCESS_TOKEN (the workflow gets it from
google-github-actions/auth). Standard library only.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import time
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
RETRY_STATUS = {429, 500, 502, 503, 504}
JST = timezone(timedelta(hours=9))

INDEXED, NOT_INDEXED, UNKNOWN = "indexed", "not_indexed", "unknown"
NOT_INDEXED_VERDICTS = {"FAIL", "NEUTRAL", "PARTIAL"}

PostJson = Callable[[str, dict], dict]


class ApiError(Exception):
    def __init__(self, status: int | None, reason: str):
        super().__init__(f"{status} {reason}")
        self.status = status
        self.reason = reason

    @property
    def kind(self) -> str:
        if self.status == 401:
            return "auth"
        if self.status == 403:
            return "permission"
        if self.status == 429:
            return "quota"
        if self.reason == "INVALID_RESPONSE":
            return "invalid_response"
        if self.status is None or self.status >= 500:
            return "transient"
        return "request"


ERROR_HELP = {
    "auth": "認証失敗：トークン／Workload Identity の設定を確認",
    "permission": "権限不足：サービスアカウントが Search Console プロパティのユーザーに追加されているか、権限（制限付き／フル）を確認",
    "quota": "API の利用上限（クォータ）に到達：時間をおいて再実行",
    "invalid_response": "API 応答の形式が想定外（欠損）",
    "transient": "一時的な通信／サーバーエラー（再試行後も失敗）",
    "request": "リクエストエラー（プロパティURLや期間指定を確認）",
}


def make_post_json(token: str, timeout: float = 30.0, retries: int = 3, backoff: float = 2.0,
                   sleep: Callable[[float], None] = time.sleep, opener=urllib.request.urlopen) -> PostJson:
    def post_json(url: str, body: dict) -> dict:
        host = urlsplit(url).netloc
        if host not in ALLOWED_HOSTS:  # hard guard: e.g. indexing.googleapis.com is never allowed
            raise ApiError(None, f"blocked host {host}")
        data = json.dumps(body).encode("utf-8")
        last: ApiError | None = None
        for attempt in range(retries + 1):
            req = urllib.request.Request(url, data=data, method="POST", headers={
                "Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": USER_AGENT})
            try:
                with opener(req, timeout=timeout) as resp:
                    parsed = json.loads(resp.read().decode("utf-8") or "{}")
                if not isinstance(parsed, dict):
                    raise ApiError(None, "INVALID_RESPONSE")
                return parsed
            except urllib.error.HTTPError as exc:
                reason = "error"
                try:
                    reason = json.loads(exc.read().decode("utf-8"))["error"]["status"]
                except Exception:
                    pass
                last = ApiError(exc.code, reason)
                if exc.code not in RETRY_STATUS:
                    raise last from None
            except ApiError:
                raise
            except json.JSONDecodeError:
                raise ApiError(None, "INVALID_RESPONSE") from None
            except Exception as exc:  # network / timeout
                last = ApiError(None, type(exc).__name__)
            if attempt < retries:
                sleep(backoff * (2 ** attempt))
        raise last  # type: ignore[misc]

    return post_json


# ---------------------------------------------------------------- dates
def comparison_periods(today: date, windows: list[int], lag: int) -> dict[int, dict]:
    end = today - timedelta(days=lag)
    out = {}
    for n in windows:
        cur_start = end - timedelta(days=n - 1)
        prev_end = cur_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=n - 1)
        out[n] = {"current": (cur_start.isoformat(), end.isoformat()),
                  "previous": (prev_start.isoformat(), prev_end.isoformat())}
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
    """Aggregate GSC rows. has_data=False means Google returned no row (no impressions or anonymized)."""
    clicks = sum(r.get("clicks", 0) for r in rows)
    impr = sum(r.get("impressions", 0) for r in rows)
    pos = (sum(r.get("position", 0) * r.get("impressions", 0) for r in rows) / impr) if impr else None
    return {"has_data": bool(rows), "clicks": clicks, "impressions": impr,
            "ctr": (clicks / impr) if impr else None, "position": pos}


def _match_rows(matcher, rows: list[dict]) -> tuple[list[dict], list[dict]]:
    exact, related = [], []
    for r in rows:
        kind = match_kind(r["keys"][0], matcher)
        if kind == "exact":
            exact.append(r)
            related.append(r)
        elif kind == "related":
            related.append(r)
    return exact, related


def keyword_metrics(keywords: list[dict], query_rows: list[dict], query_page_rows: list[dict]) -> list[dict]:
    """site = all pages of the property (dimension query); page = only the keyword's target URL
    (dimensions query,page filtered by page). The two are never mixed."""
    out = []
    for kw in keywords:
        m = keyword_matchers(kw["keyword"])
        s_exact, s_rel = _match_rows(m, query_rows)
        page_rows = [r for r in query_page_rows if len(r["keys"]) > 1 and r["keys"][1] == kw["url"]]
        p_exact, p_rel = _match_rows(m, page_rows)
        out.append({**kw,
                    "site": {"exact": _agg(s_exact), "related": _agg(s_rel)},
                    "page": {"exact": _agg(p_exact), "related": _agg(p_rel)}})
    return out


# ---------------------------------------------------------------- API calls
def search_analytics(post: PostJson, prop: str, start: str, end: str, dims: list[str], limit: int) -> list[dict]:
    url = ANALYTICS_ENDPOINT.format(site=quote(prop, safe=""))
    body = {"startDate": start, "endDate": end, "type": "web", "dataState": "final", "rowLimit": limit}
    if dims:
        body["dimensions"] = dims
    res = post(url, body)
    rows = res.get("rows", [])
    if not isinstance(rows, list) or any(not isinstance(r, dict) or len(r.get("keys", [])) != len(dims) for r in rows):
        raise ApiError(None, "INVALID_RESPONSE")
    return rows


def inspect_url(post: PostJson, prop: str, url: str) -> dict:
    res = post(INSPECT_ENDPOINT, {"inspectionUrl": url, "siteUrl": prop, "languageCode": "ja"})
    s = (res.get("inspectionResult") or {}).get("indexStatusResult")
    if not isinstance(s, dict):
        raise ApiError(None, "INVALID_RESPONSE")
    verdict = s.get("verdict")
    status = INDEXED if verdict == "PASS" else NOT_INDEXED if verdict in NOT_INDEXED_VERDICTS else UNKNOWN
    return {
        "url": url, "status": status, "verdict": verdict,
        "coverage_state": s.get("coverageState"), "indexing_state": s.get("indexingState"),
        "robots_txt_state": s.get("robotsTxtState"), "page_fetch_state": s.get("pageFetchState"),
        "google_canonical": s.get("googleCanonical"), "user_canonical": s.get("userCanonical"),
        "last_crawl_time": s.get("lastCrawlTime"), "crawled_as": s.get("crawledAs"),
        "in_sitemaps": s.get("sitemap", []),
    }


def console_inspect_link(prop: str, url: str) -> str:
    return f"https://search.google.com/search-console/inspect?resource_id={quote(prop, safe='')}&id={quote(url, safe='')}"


def run_monitor(cfg: dict, post: PostJson, today: date, keywords: list[dict] | None) -> dict:
    prop = cfg["gsc_property"]
    errors: list[dict] = []

    def record(op: str, exc: ApiError, **extra):
        errors.append({"op": op, "status": exc.status, "reason": exc.reason, "kind": exc.kind, **extra})

    inspections = []
    for url in indexable_urls(cfg):
        try:
            inspections.append(inspect_url(post, prop, url))
        except ApiError as exc:
            record("urlInspection", exc, url=url)
            inspections.append({"url": url, "status": UNKNOWN, "verdict": None, "error": f"{exc.status} {exc.reason}", "error_kind": exc.kind})
            if exc.kind in ("auth", "permission") and not any(i["status"] != UNKNOWN for i in inspections):
                # first call already refused: further calls would fail the same way
                for rest in indexable_urls(cfg)[len(inspections):]:
                    inspections.append({"url": rest, "status": UNKNOWN, "verdict": None, "error": "未実行（認証/権限エラーのため中止）", "error_kind": exc.kind})
                break
    for i in inspections:
        if i["status"] == NOT_INDEXED:
            i["console_link"] = console_inspect_link(prop, i["url"])

    spot_urls = {s["url"]: s["name"] for s in cfg["spot_pages"]}
    periods = comparison_periods(today, cfg.get("comparison_windows_days", [7, 28, 90]), cfg.get("gsc_data_lag_days", 3))
    performance = {}
    auth_blocked = any(e["kind"] in ("auth", "permission") for e in errors) and not any(i["status"] != UNKNOWN for i in inspections)
    for n, p in periods.items():
        entry = {"current_range": p["current"], "previous_range": p["previous"]}
        for label in ("current", "previous"):
            start, end = p[label]
            if auth_blocked:
                entry[label] = None
                continue
            try:
                totals = search_analytics(post, prop, start, end, [], 1)
                pages = search_analytics(post, prop, start, end, ["page"], 1000)
                queries = search_analytics(post, prop, start, end, ["query"], 25000)
                query_pages = search_analytics(post, prop, start, end, ["query", "page"], 25000)
            except ApiError as exc:
                record("searchAnalytics", exc, window=n, period=label)
                entry[label] = None
                continue
            entry[label] = {
                "totals": _agg(totals),
                "spots": {u: _agg([r for r in pages if r["keys"][0] == u]) for u in spot_urls},
                "keywords": keyword_metrics(keywords, queries, query_pages) if keywords is not None else None,
                "query_rows": len(queries),
            }
        performance[n] = entry

    return {
        "site_id": cfg["site_id"], "property": prop,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "inspections": inspections,
        "not_indexed": [i for i in inspections if i["status"] == NOT_INDEXED],
        "unknown": [i for i in inspections if i["status"] == UNKNOWN],
        "performance": performance,
        "keywords_status": "loaded" if keywords is not None else "missing",
        "errors": errors,
        "auth_blocked": auth_blocked,
    }


def run_state(report: dict) -> dict:
    """Public-safe status: state name and counts only."""
    errs = report["errors"]
    kinds = sorted({e["kind"] for e in errs})
    ins = report["inspections"]
    perf_ok = sum(1 for e in report["performance"].values() for k in ("current", "previous") if e.get(k))
    perf_total = 2 * len(report["performance"])
    if report["auth_blocked"]:
        state = "auth_error"
    elif not errs:
        state = "ok"
    elif all(i["status"] == UNKNOWN for i in ins) and perf_ok == 0:
        state = "failed"
    else:
        state = "partial"
    no_data = perf_ok > 0 and all(
        not (e.get("current") or {}).get("totals", {}).get("has_data", False) for e in report["performance"].values())
    return {"state": state, "error_kinds": kinds, "errors": len(errs),
            "inspections_ok": sum(1 for i in ins if not i.get("error")), "inspections_total": len(ins),
            "analytics_ok": perf_ok, "analytics_total": perf_total,
            "search_data": "none" if no_data else "present" if perf_ok else "unknown",
            "keywords": report["keywords_status"]}


# ---------------------------------------------------------------- output
NO_DATA = "データなし"


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


def _cell(m: dict | None, fields=("impressions", "clicks", "position")) -> str:
    if m is None:
        return "取得失敗"
    if not m["has_data"]:
        return NO_DATA
    f = {"impressions": _fmt_num, "clicks": _fmt_num, "position": _fmt_pos}
    return " / ".join(f[k](m[k]) for k in fields)


def to_markdown(report: dict, cfg: dict) -> str:
    spot_names = {s["url"]: s["name"] for s in cfg["spot_pages"]}
    ins = report["inspections"]
    n_idx = sum(1 for i in ins if i["status"] == INDEXED)
    n_unknown = len(report["unknown"])
    spot_idx = sum(1 for i in ins if i["status"] == INDEXED and i["url"] in spot_names)
    L = [
        f"# Search Console 監視レポート（非公開）— {cfg.get('site_name', report['site_id'])}", "",
        f"生成(UTC): {report['generated_at']} / プロパティ: {report['property']}", "",
        "> このファイルは非公開データです。公開リポジトリ・Issue・SNSに貼らないでください。", "",
        "## 1. インデックス登録状況（URL検査API）", "",
        f"- 登録済み: **{n_idx}** / 未登録: **{len(report['not_indexed'])}** / 判定不能: **{n_unknown}**（全 {len(ins)} URL）　9地点の登録済み: **{spot_idx} / {len(spot_names)}**",
        "- 判定不能＝API取得失敗・応答欠損など。未登録とは数えません。登録状況は Google 側の集計時点のもので、登録を保証しません。",
        "", "| ページ | 状態 | 判定 | カバレッジ | 最終クロール | Google選択canonical |", "|---|---|---|---|---|---|",
    ]
    label = {INDEXED: "登録済み", NOT_INDEXED: "未登録", UNKNOWN: "判定不能"}
    for i in ins:
        name = spot_names.get(i["url"], i["url"])
        if i.get("error"):
            L.append(f"| {name} | 判定不能 | - | {i['error']} | - | - |")
            continue
        g = i.get("google_canonical") or "-"
        if g not in ("-", i["url"]):
            g = f"⚠️ {g}"
        L.append(f"| {name} | {label[i['status']]} | {i.get('verdict') or '-'} | {i.get('coverage_state') or '-'} | {i.get('last_crawl_time') or '-'} | {g} |")

    L += ["", "## 2. 未登録ページ（手動の登録リクエスト候補）", ""]
    if report["not_indexed"]:
        L += ["登録リクエストは **Search Console の正規画面（URL検査 →「インデックス登録をリクエスト」）から本人が実施** してください。",
              "このシステムはリクエストを送信しません。「リクエスト受理」と「登録完了」は別物です。",
              "リンクが開けない場合は、Search Console 上部の検索窓に下のURLを貼り付けてください。", ""]
        for i in report["not_indexed"]:
            L.append(f"- {spot_names.get(i['url'], i['url'])}: {i.get('coverage_state') or i.get('verdict')}"
                     f"（robots: {i.get('robots_txt_state') or '-'} / 取得: {i.get('page_fetch_state') or '-'}）")
            L.append(f"  - URL: `{i['url']}`　[Search Consoleで検査を開く]({i['console_link']})")
    elif n_unknown == len(ins):
        L.append("**全URLが判定不能のため、未登録ページを抽出できませんでした**（下の取得エラーを確認）。")
    elif n_unknown:
        L.append(f"判定できたURLに未登録はありません。ただし {n_unknown} URL は判定不能です。")
    else:
        L.append("未登録として抽出されたページはありません。")

    perf = report["performance"]
    L += ["", "## 3. 検索実績（ウェブ検索・前期間比較）", "",
          "「データなし」＝Googleが行を返さなかった（表示なし、または件数が少なく匿名化）。0件とは区別しています。", "",
          "| 期間 | 範囲 | クリック | 前期比 | 表示回数 | 前期比 | CTR | 平均順位 | 前期比 |",
          "|---|---|---|---|---|---|---|---|---|"]
    for n, e in perf.items():
        cur, prev = e.get("current"), e.get("previous")
        rng = f"{e['current_range'][0]}〜{e['current_range'][1]}"
        if not cur:
            L.append(f"| {n}日 | {rng} | 取得失敗 | | | | | | |")
            continue
        c = cur["totals"]
        if not c["has_data"]:
            L.append(f"| {n}日 | {rng} | {NO_DATA} | | | | | | |")
            continue
        p = (prev or {}).get("totals") or {}
        pv = (lambda k: p.get(k)) if p.get("has_data") else (lambda k: None)
        L.append(f"| {n}日 | {rng} | {_fmt_num(c['clicks'])} | {_delta(c['clicks'], pv('clicks'))} "
                 f"| {_fmt_num(c['impressions'])} | {_delta(c['impressions'], pv('impressions'))} | {_fmt_ctr(c['ctr'])} "
                 f"| {_fmt_pos(c['position'])} | {_delta(c['position'], pv('position'))} |")
    L += ["", "平均順位の前期比はマイナスが改善です。前期間がデータなしの場合は「-」。", "", "### 9地点ページ別（表示 / クリック / 平均順位）", "",
          "| 地点 | " + " | ".join(f"{n}日" for n in perf) + " |", "|---|" + "---|" * len(perf)]
    for url, name in spot_names.items():
        cells = [_cell((e.get("current") or {}).get("spots", {}).get(url) if e.get("current") else None) for e in perf.values()]
        L.append(f"| {name} | " + " | ".join(cells) + " |")

    L += ["", "## 4. 重点キーワード", ""]
    if report["keywords_status"] != "loaded":
        L.append(f"**未計測**：キーワード表 `{cfg.get('keywords_csv')}` がありません（PR #80 マージ後に自動で集計対象になります）。")
    else:
        L += ["- **対象ページ**＝キーワード表の対象URLに表示された分だけ（検索語×ページ）。**サイト全体**＝どのページの表示かを問わない合計。",
              "- 完全一致＝その語そのもの（空白・「・」は無視）。関連＝地点名（「・」区切りのどれか）と意図語の両方を含む語の合計。", ""]
        for n, e in perf.items():
            cur = e.get("current")
            L += [f"### {n}日（{e['current_range'][0]}〜{e['current_range'][1]}）", ""]
            if not cur:
                L += ["取得失敗", ""]
                continue
            L += ["| キーワード | 対象ページ 完全一致 | 対象ページ 関連 | サイト全体 完全一致 | サイト全体 関連 |", "|---|---|---|---|---|"]
            for k in cur["keywords"]:
                L.append(f"| {k['keyword']} | {_cell(k['page']['exact'])} | {_cell(k['page']['related'])} | "
                         f"{_cell(k['site']['exact'])} | {_cell(k['site']['related'])} |")
            L.append("")
        L.append("表の値は 表示 / クリック / 平均順位。")

    if report["errors"]:
        L += ["", "## 5. 取得エラー", ""]
        for kind in sorted({e["kind"] for e in report["errors"]}):
            L.append(f"- **{ERROR_HELP.get(kind, kind)}**")
        for e in report["errors"]:
            where = e.get("url") or f"{e.get('window')}日/{e.get('period')}"
            L.append(f"  - {e['op']} {where}: {e['status']} {e['reason']}")
    return "\n".join(L) + "\n"


def keyword_csv(report: dict) -> str:
    """Per-keyword metrics in a flat CSV (for updating the tracking sheet by hand)."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["ポイント名", "キーワード", "対象URL", "期間(日)", "期間開始", "期間終了", "範囲", "一致",
                "データ", "表示回数", "クリック数", "CTR", "平均掲載順位", "前期間 表示回数", "前期間 平均掲載順位"])
    for n, e in report["performance"].items():
        cur, prev = e.get("current"), e.get("previous")
        if not cur or cur.get("keywords") is None:
            continue
        prev_kw = (prev or {}).get("keywords") or [None] * len(cur["keywords"])
        for k, pk in zip(cur["keywords"], prev_kw):
            for scope, scope_label in (("page", "対象ページ"), ("site", "サイト全体")):
                for kind, kind_label in (("exact", "完全一致"), ("related", "関連")):
                    m = k[scope][kind]
                    pm = (pk or {}).get(scope, {}).get(kind) if pk else None
                    has_prev = bool(pm and pm.get("has_data"))
                    w.writerow([k["spot"], k["keyword"], k["url"], n, e["current_range"][0], e["current_range"][1],
                                scope_label, kind_label, "あり" if m["has_data"] else NO_DATA,
                                m["impressions"] if m["has_data"] else "", m["clicks"] if m["has_data"] else "",
                                "" if m["ctr"] is None else round(m["ctr"], 4),
                                "" if m["position"] is None else round(m["position"], 2),
                                pm["impressions"] if has_prev else ("" if pm is None else NO_DATA),
                                "" if not has_prev or pm["position"] is None else round(pm["position"], 2)])
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
    ap.add_argument("--status-out", help="public-safe status JSON (state and counts only)")
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
        print(f"::warning::キーワード表 {kw_path} がないため重点キーワードは「未計測」として出力します")

    report = run_monitor(cfg, make_post_json(token), datetime.now(JST).date(), keywords)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "gsc-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (out_dir / "gsc-report.md").write_text(to_markdown(report, cfg), encoding="utf-8")
    if keywords is not None:
        (out_dir / "keyword-metrics.csv").write_text(keyword_csv(report), encoding="utf-8-sig")

    status = run_state(report)
    if args.status_out:
        Path(args.status_out).write_text(json.dumps(status, ensure_ascii=False), encoding="utf-8")
    # Public-safe stdout: state and counts only.
    print(f"GSC読み取り: state={status['state']} URL検査 {status['inspections_ok']}/{status['inspections_total']}"
          f" 検索実績 {status['analytics_ok']}/{status['analytics_total']} 検索データ={status['search_data']} キーワード表={status['keywords']}")
    for kind in status["error_kinds"]:
        print(f"::error title=GSC API::{ERROR_HELP.get(kind, kind)}")
    return 0 if status["state"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
