#!/usr/bin/env python3
"""Offline tests for scripts/seo (no network, no credentials). Run: python3 tests/seo/test_seo_monitor.py"""
from __future__ import annotations

import http.server
import json
import os
import sys
import tempfile
import threading
import unittest
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "seo"))

import gsc_monitor as gm  # noqa: E402
import technical_audit as ta  # noqa: E402
from seo_common import HttpResult, http_get, indexable_urls, load_config, validate_config  # noqa: E402

CFG = load_config(ROOT / "config" / "seo-monitor.json")


def page_html(url: str, robots: str = "index,follow", canonical: str | None = "SELF") -> str:
    c = "" if canonical is None else f'<link rel="canonical" href="{url if canonical == "SELF" else canonical}">'
    return f'<!doctype html><html><head><meta name="robots" content="{robots}">{c}</head><body>x</body></html>'


def healthy_site(cfg: dict) -> dict[str, HttpResult]:
    site: dict[str, HttpResult] = {}
    base = cfg["base_url"]
    site[base + "robots.txt"] = HttpResult(base + "robots.txt", 200, body=f"User-agent: *\nAllow: /\nSitemap: {base}sitemap.xml\n")
    locs = "".join(f"<url><loc>{u}</loc></url>" for u in indexable_urls(cfg))
    site[base + "sitemap.xml"] = HttpResult(base + "sitemap.xml", 200,
        body=f'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{locs}</urlset>')
    for u in indexable_urls(cfg):
        site[u] = HttpResult(u, 200, {"content-type": "text/html"}, page_html(u))
    for u in cfg["noindex_pages"]:
        site[u] = HttpResult(u, 200, {}, page_html(u, "noindex,follow"))
    site[cfg["not_found_probe"]] = HttpResult(cfg["not_found_probe"], 404)
    site[cfg["http_to_https_probe"]] = HttpResult(cfg["http_to_https_probe"], 301, {"location": base})
    return site


def fetcher(site):
    return lambda url: site.get(url, HttpResult(url, 404))


class ConfigTests(unittest.TestCase):
    def test_nine_spots_match_representative_config(self):
        rep = json.loads((ROOT / "config" / "representative-spots.json").read_text(encoding="utf-8"))
        expected = [f"https://kanto.rss7.net/spots/{s['slug']}/" for s in rep["spots"]]
        self.assertEqual([s["url"] for s in CFG["spot_pages"]], expected)
        self.assertEqual(len(expected), 9)

    def test_indexable_order_and_count(self):
        urls = indexable_urls(CFG)
        self.assertEqual(urls[0], "https://kanto.rss7.net/")
        self.assertEqual(len(urls), 13)

    def test_rejects_foreign_host(self):
        bad = json.loads(json.dumps(CFG))
        bad["spot_pages"][0]["url"] = "https://example.com/x/"
        with self.assertRaises(ValueError):
            validate_config(bad)


class TechnicalAuditTests(unittest.TestCase):
    def test_healthy_site_has_no_errors(self):
        r = ta.run_audit(CFG, fetcher(healthy_site(CFG)))
        self.assertEqual(r["errors"], 0, [f for f in r["findings"] if f["level"] != "ok"])
        self.assertEqual(r["warnings"], 0)
        self.assertIn("鵠沼", ta.to_markdown(r, CFG))

    def test_detects_each_problem(self):
        site = healthy_site(CFG)
        spots = [s["url"] for s in CFG["spot_pages"]]
        site[spots[0]] = HttpResult(spots[0], 200, {}, page_html(spots[0], canonical="https://kanto.rss7.net/"))
        site[spots[1]] = HttpResult(spots[1], 200, {}, page_html(spots[1], robots="noindex,follow"))
        site[spots[2]] = HttpResult(spots[2], 200, {"x-robots-tag": "noindex"}, page_html(spots[2]))
        site[spots[3]] = HttpResult(spots[3], 301, {"location": "https://kanto.rss7.net/"})
        site[spots[4]] = HttpResult(spots[4], 200, {}, page_html(spots[4], canonical=None))
        site[spots[5]] = HttpResult(spots[5], None, error="timeout")
        site[CFG["base_url"] + "robots.txt"] = HttpResult("r", 200, body="User-agent: *\nDisallow: /spots/taito/\n")
        r = ta.run_audit(CFG, fetcher(site))
        errs = {(f["check"], f["url"]) for f in r["findings"] if f["level"] == "error"}
        self.assertIn(("canonical", spots[0]), errs)
        self.assertIn(("robots", spots[1]), errs)
        self.assertIn(("robots", spots[2]), errs)
        self.assertIn(("http", spots[3]), errs)
        self.assertIn(("canonical", spots[4]), errs)
        self.assertIn(("http", spots[5]), errs)
        self.assertIn(("robots.txt", spots[6]), errs)
        warns = {f["check"] for f in r["findings"] if f["level"] == "warning"}
        self.assertIn("robots.txt", warns)  # Sitemap line missing

    def test_sitemap_missing_and_noindex_listed(self):
        site = healthy_site(CFG)
        locs = indexable_urls(CFG)[:-1] + CFG["noindex_pages"]
        body = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{u}</loc></url>" for u in locs) + "</urlset>"
        site[CFG["base_url"] + "sitemap.xml"] = HttpResult("s", 200, body=body)
        r = ta.run_audit(CFG, fetcher(site))
        msgs = [f["message"] for f in r["findings"] if f["level"] == "error" and f["check"] == "sitemap.xml"]
        self.assertTrue(any("ありません" in m for m in msgs))
        self.assertTrue(any("noindex" in m for m in msgs))

    def test_soft_404_and_no_https_redirect_warn(self):
        site = healthy_site(CFG)
        site[CFG["not_found_probe"]] = HttpResult("p", 200, body="ok")
        site[CFG["http_to_https_probe"]] = HttpResult("h", 200)
        r = ta.run_audit(CFG, fetcher(site))
        self.assertEqual(r["errors"], 0)
        self.assertEqual({f["check"] for f in r["findings"] if f["level"] == "warning"}, {"404", "https"})


class HttpGetTests(unittest.TestCase):
    """Real socket test against a local server: redirects must NOT be followed."""

    @classmethod
    def setUpClass(cls):
        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                if self.path == "/redirect":
                    self.send_response(301)
                    self.send_header("Location", "/target")
                    self.end_headers()
                    return
                self.send_response(200 if self.path == "/target" else 404)
                self.send_header("X-Robots-Tag", "noindex")
                self.end_headers()
                self.wfile.write("本文".encode())

            def log_message(self, *a):
                pass

        cls.srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        cls.base = f"http://127.0.0.1:{cls.srv.server_port}"
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def test_redirect_reported(self):
        r = http_get(self.base + "/redirect", retries=0)
        self.assertEqual(r.status, 301)
        self.assertEqual(r.header("location"), "/target")

    def test_ok_and_404(self):
        self.assertEqual(http_get(self.base + "/target", retries=0).body, "本文")
        r = http_get(self.base + "/nope", retries=0)
        self.assertEqual(r.status, 404)
        self.assertEqual(r.header("x-robots-tag"), "noindex")


class FakeGsc:
    def __init__(self, fail_inspect: str | None = None, fail_all: gm.ApiError | None = None,
                 bad_inspect: str | None = None, empty_search: bool = False):
        self.calls: list[tuple[str, dict]] = []
        self.fail_inspect, self.fail_all, self.bad_inspect, self.empty_search = fail_inspect, fail_all, bad_inspect, empty_search

    def __call__(self, url, body):
        self.calls.append((url, body))
        if self.fail_all:
            raise self.fail_all
        if url == gm.INSPECT_ENDPOINT:
            u = body["inspectionUrl"]
            if u == self.fail_inspect:
                raise gm.ApiError(503, "UNAVAILABLE")
            if u == self.bad_inspect:
                return {"inspectionResult": {}}  # malformed
            ok = u == "https://kanto.rss7.net/"
            return {"inspectionResult": {"indexStatusResult": {
                "verdict": "PASS" if ok else ("VERDICT_UNSPECIFIED" if u.endswith("/about/") else "NEUTRAL"),
                "coverageState": "送信して登録されました" if ok else "検出 - インデックス未登録",
                "googleCanonical": u if ok else None,
            }}}
        if self.empty_search:
            return {}
        dims = body.get("dimensions", [])
        if not dims:
            return {"rows": [{"keys": [], "clicks": 5, "impressions": 100, "ctr": 0.05, "position": 12.0}]}
        if dims == ["page"]:
            return {"rows": [{"keys": ["https://kanto.rss7.net/spots/kugenuma/"], "clicks": 2, "impressions": 40, "position": 8.0}]}
        q_rows = [
            ("鵠沼 波情報", "https://kanto.rss7.net/spots/kugenuma/", 3, 30, 6.0),
            ("鵠沼 波情報", "https://kanto.rss7.net/", 1, 20, 15.0),
            ("鵠沼波情報", "https://kanto.rss7.net/spots/kugenuma/", 1, 10, 10.0),
            ("鵠沼 波情報 ライブ", "https://kanto.rss7.net/", 0, 5, 20.0),
            ("大洗 波予想", "https://kanto.rss7.net/", 1, 8, 9.0),
            ("片貝 天気", "https://kanto.rss7.net/spots/katakai/", 0, 3, 30.0),
        ]
        if dims == ["query", "page"]:
            return {"rows": [{"keys": [q, pg], "clicks": c, "impressions": i, "position": po} for q, pg, c, i, po in q_rows]}
        agg: dict[str, list] = {}
        for q, _pg, c, i, po in q_rows:  # query-only rows = sum over pages
            a = agg.setdefault(q, [0, 0, 0.0])
            a[0] += c; a[1] += i; a[2] += po * i
        return {"rows": [{"keys": [q], "clicks": a[0], "impressions": a[1], "position": a[2] / a[1]} for q, a in agg.items()]}


KEYWORDS = [
    {"keyword": "鵠沼 波情報", "url": "https://kanto.rss7.net/spots/kugenuma/", "spot": "鵠沼"},
    {"keyword": "大洗・大貫 波予想", "url": "https://kanto.rss7.net/spots/oarai-onuki/", "spot": "大洗・大貫"},
    {"keyword": "片貝 波情報", "url": "https://kanto.rss7.net/spots/katakai/", "spot": "片貝"},
]


class _Resp:
    def __init__(self, body: bytes):
        self.body = body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return self.body


def scripted_opener(script):
    """script: list of bytes (200 response) or int (HTTP error status) or Exception."""
    import io
    import urllib.error
    calls = []

    def opener(req, timeout=None):
        calls.append(req.full_url)
        item = script[len(calls) - 1]
        if isinstance(item, int):
            raise urllib.error.HTTPError(req.full_url, item, "x", {}, io.BytesIO(b'{"error":{"status":"E%d"}}' % item))
        if isinstance(item, Exception):
            raise item
        return _Resp(item)

    opener.calls = calls
    return opener


class GscMonitorTests(unittest.TestCase):
    def test_periods(self):
        p = gm.comparison_periods(date(2026, 11, 28), [7, 28, 90], 3)
        self.assertEqual(p[7]["current"], ("2026-11-19", "2026-11-25"))
        self.assertEqual(p[7]["previous"], ("2026-11-12", "2026-11-18"))
        self.assertEqual(p[28]["current"][0], "2026-10-29")
        self.assertEqual(p[90]["previous"][1], "2026-08-27")

    def test_keyword_matching(self):
        m = gm.keyword_matchers("大洗・大貫 波予想")
        self.assertEqual(gm.match_kind("大洗・大貫 波予想", m), "exact")
        self.assertEqual(gm.match_kind("大洗大貫波予想", m), "exact")
        self.assertEqual(gm.match_kind("大洗 波予想", m), "related")
        self.assertEqual(gm.match_kind("大貫 波予想 明日", m), "related")
        self.assertIsNone(gm.match_kind("大洗 天気", m))
        self.assertEqual(gm.match_kind("ＫＵＧＥＮＵＭＡ 波情報", gm.keyword_matchers("kugenuma 波情報")), "exact")

    def test_run_monitor_end_to_end(self):
        fake = FakeGsc(fail_inspect="https://kanto.rss7.net/privacy/", bad_inspect="https://kanto.rss7.net/contact/")
        rep = gm.run_monitor(CFG, fake, date(2026, 11, 28), KEYWORDS)
        self.assertEqual(len(rep["inspections"]), 13)
        # home PASS; about VERDICT_UNSPECIFIED, privacy error, contact malformed -> unknown (not "not indexed")
        self.assertEqual({i["url"].rsplit("/", 2)[-2] for i in rep["unknown"]}, {"about", "privacy", "contact"})
        self.assertEqual(len(rep["not_indexed"]), 9)
        self.assertTrue(all("search-console/inspect" in i["console_link"] for i in rep["not_indexed"]))
        self.assertEqual({e["kind"] for e in rep["errors"]}, {"transient", "invalid_response"})
        kw = rep["performance"][28]["current"]["keywords"]
        # site-wide vs target page are separated
        self.assertEqual(kw[0]["site"]["exact"]["impressions"], 60)   # 30+20+10 over all pages
        self.assertEqual(kw[0]["page"]["exact"]["impressions"], 40)   # only /spots/kugenuma/
        self.assertAlmostEqual(kw[0]["page"]["exact"]["position"], 7.0)
        self.assertEqual(kw[0]["site"]["related"]["impressions"], 65)
        self.assertEqual(kw[0]["page"]["related"]["impressions"], 40)
        self.assertEqual(kw[1]["site"]["related"]["impressions"], 8)  # shown on home, not target page
        self.assertFalse(kw[1]["page"]["related"]["has_data"])
        self.assertFalse(kw[2]["site"]["related"]["has_data"])
        self.assertEqual(rep["performance"][7]["current"]["spots"]["https://kanto.rss7.net/spots/kugenuma/"]["clicks"], 2)
        self.assertFalse(rep["performance"][7]["current"]["spots"]["https://kanto.rss7.net/spots/taito/"]["has_data"])
        for url, _ in fake.calls:
            self.assertTrue(url.startswith("https://searchconsole.googleapis.com/"), url)
        md = gm.to_markdown(rep, CFG)
        for needle in ("登録済み: **1** / 未登録: **9** / 判定不能: **3**", "判定不能", "対象ページ", "サイト全体",
                       "データなし", "7日", "28日", "90日", "大洗・大貫 波予想", "取得エラー", "一時的な通信"):
            self.assertIn(needle, md)
        self.assertEqual(gm.run_state(rep)["state"], "partial")
        csv_text = gm.keyword_csv(rep)
        self.assertIn("対象ページ", csv_text)
        self.assertIn("データなし", csv_text)

    def test_all_failed_is_not_reported_as_no_unindexed(self):
        rep = gm.run_monitor(CFG, FakeGsc(fail_all=gm.ApiError(503, "UNAVAILABLE")), date(2026, 11, 28), KEYWORDS)
        md = gm.to_markdown(rep, CFG)
        self.assertIn("全URLが判定不能", md)
        self.assertNotIn("未登録として抽出されたページはありません", md)
        self.assertEqual(gm.run_state(rep)["state"], "failed")

    def test_permission_error_stops_early_and_is_auth_error(self):
        fake = FakeGsc(fail_all=gm.ApiError(403, "PERMISSION_DENIED"))
        rep = gm.run_monitor(CFG, fake, date(2026, 11, 28), KEYWORDS)
        self.assertEqual(len(fake.calls), 1)
        self.assertEqual(len(rep["inspections"]), 13)
        st = gm.run_state(rep)
        self.assertEqual(st["state"], "auth_error")
        self.assertEqual(st["error_kinds"], ["permission"])
        self.assertIn("権限不足", gm.to_markdown(rep, CFG))

    def test_no_search_rows_is_no_data_not_zero(self):
        rep = gm.run_monitor(CFG, FakeGsc(empty_search=True), date(2026, 11, 28), KEYWORDS)
        st = gm.run_state(rep)
        self.assertEqual(st["state"], "ok")
        self.assertEqual(st["search_data"], "none")
        md = gm.to_markdown(rep, CFG)
        self.assertIn("| 7日 | 2026-11-19〜2026-11-25 | データなし |", md)

    def test_without_keywords_is_unmeasured(self):
        rep = gm.run_monitor(CFG, FakeGsc(), date(2026, 11, 28), None)
        self.assertEqual(gm.run_state(rep)["keywords"], "missing")
        self.assertIn("**未計測**", gm.to_markdown(rep, CFG))

    def test_retry_transient_then_success(self):
        sleeps = []
        op = scripted_opener([503, ConnectionResetError("reset"), b'{"rows": []}'])
        post = gm.make_post_json("t", sleep=sleeps.append, opener=op)
        self.assertEqual(post(gm.INSPECT_ENDPOINT, {}), {"rows": []})
        self.assertEqual(len(op.calls), 3)
        self.assertEqual(sleeps, [2.0, 4.0])

    def test_no_retry_on_permission_and_gives_up_after_retries(self):
        op = scripted_opener([403])
        with self.assertRaises(gm.ApiError) as cm:
            gm.make_post_json("t", sleep=lambda s: None, opener=op)(gm.INSPECT_ENDPOINT, {})
        self.assertEqual((cm.exception.kind, len(op.calls)), ("permission", 1))
        op = scripted_opener([429, 429, 429, 429])
        with self.assertRaises(gm.ApiError) as cm:
            gm.make_post_json("t", sleep=lambda s: None, opener=op)(gm.INSPECT_ENDPOINT, {})
        self.assertEqual((cm.exception.kind, len(op.calls)), ("quota", 4))

    def test_malformed_json_is_error(self):
        for body in (b"not json", b"[1,2]"):
            with self.assertRaises(gm.ApiError) as cm:
                gm.make_post_json("t", sleep=lambda s: None, opener=scripted_opener([body]))(gm.INSPECT_ENDPOINT, {})
            self.assertEqual(cm.exception.kind, "invalid_response")
        with self.assertRaises(gm.ApiError):
            gm.search_analytics(lambda u, b: {"rows": [{"keys": ["a"]}]}, "p", "s", "e", ["query", "page"], 1)

    def test_indexing_api_host_blocked(self):
        post = gm.make_post_json("dummy")
        with self.assertRaises(gm.ApiError) as cm:
            post("https://indexing.googleapis.com/v3/urlNotifications:publish", {})
        self.assertIn("blocked host", cm.exception.reason)

    def test_out_dir_must_be_outside_repo(self):
        with self.assertRaises(SystemExit):
            gm.ensure_outside_repo(ROOT / "tmp-gsc")
        with tempfile.TemporaryDirectory() as d:
            gm.ensure_outside_repo(Path(d))

    def test_main_stdout_and_status_have_no_private_data(self):
        import contextlib
        import io

        fake = FakeGsc()
        orig = gm.make_post_json
        gm.make_post_json = lambda token: fake
        os.environ["GSC_ACCESS_TOKEN"] = "dummy"
        buf = io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(buf):
                status_path = Path(d) / "status.json"
                code = gm.main(["--config", str(ROOT / "config" / "seo-monitor.json"),
                                "--out-dir", str(Path(d) / "out"), "--status-out", str(status_path)])
                self.assertTrue((Path(d) / "out" / "gsc-report.md").is_file())
                status_text = status_path.read_text(encoding="utf-8")
        finally:
            gm.make_post_json = orig
            del os.environ["GSC_ACCESS_TOKEN"]
        out = buf.getvalue()
        self.assertEqual(code, 0)  # VERDICT_UNSPECIFIED is "unknown" in the report, not an API error
        for text in (out, status_text):
            for secret in ("鵠沼", "検出 - インデックス未登録", "impressions\"", "NEUTRAL", "spots/", "kanto.rss7.net"):
                self.assertNotIn(secret, text)


class DeliverScriptTests(unittest.TestCase):
    """Runs scripts/seo/deliver_report.sh with a real age key pair (skipped if age is not installed)."""

    def setUp(self):
        import shutil
        if not shutil.which("age") or not shutil.which("age-keygen"):
            self.skipTest("age not installed")

    def _run(self, env_extra, src_files=True):
        import subprocess
        d = Path(tempfile.mkdtemp())
        src = d / "src"
        src.mkdir()
        if src_files:
            (src / "gsc-report.md").write_text("秘密データ", encoding="utf-8")
            (src / "gsc-report.json").write_text("{}", encoding="utf-8")
        env = {k: v for k, v in os.environ.items() if not k.startswith("SEO_")}
        env.update(env_extra, RUNNER_TEMP=str(d))
        r = subprocess.run(["bash", str(ROOT / "scripts/seo/deliver_report.sh"), str(src), str(d / "enc"), "kanto"],
                           env=env, capture_output=True, text=True)
        return r, d

    def test_age_roundtrip_and_tamper_detection(self):
        import subprocess
        key = Path(tempfile.mkdtemp()) / "key.txt"
        pub = subprocess.run(["age-keygen", "-o", str(key)], capture_output=True, text=True).stderr.split(":", 1)[1].strip()
        r, d = self._run({"SEO_REPORT_AGE_RECIPIENT": pub})
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertNotIn("秘密データ", r.stdout + r.stderr)
        self.assertFalse((d / "src").exists())  # plaintext removed
        enc = next((d / "enc").glob("gsc-report-kanto-*.tar.gz.age"))
        self.assertNotIn("秘密データ".encode(), enc.read_bytes())
        out = d / "out"
        r2 = subprocess.run(["bash", str(ROOT / "scripts/seo/decrypt_report.sh"), str(enc), str(key), str(out)],
                            capture_output=True, text=True)
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertEqual((out / "gsc-report.md").read_text(encoding="utf-8"), "秘密データ")
        data = bytearray(enc.read_bytes())
        data[-20] ^= 0x01  # flip one bit in the payload
        enc.write_bytes(bytes(data))
        r3 = subprocess.run(["bash", str(ROOT / "scripts/seo/decrypt_report.sh"), str(enc), str(key), str(d / "out2")],
                            capture_output=True, text=True)
        self.assertNotEqual(r3.returncode, 0)
        self.assertFalse((d / "out2" / "gsc-report.md").exists())

    def test_no_method_configured_fails(self):
        r, d = self._run({})
        self.assertEqual(r.returncode, 2)
        self.assertFalse((d / "src").exists())

    def test_bad_recipient_rejected(self):
        r, _ = self._run({"SEO_REPORT_AGE_RECIPIENT": "not-a-key"})
        self.assertEqual(r.returncode, 1)

class RepoSafetyTests(unittest.TestCase):
    def test_no_indexing_api_usage_anywhere(self):
        for p in list((ROOT / "scripts" / "seo").glob("*.py")) + [ROOT / ".github" / "workflows" / "seo-monitor.yml"]:
            text = p.read_text(encoding="utf-8")
            self.assertNotIn("urlNotifications", text, p)
            self.assertNotIn("auth/indexing", text, p)

    def test_workflow_uses_readonly_scope_and_encrypts(self):
        wf = (ROOT / ".github" / "workflows" / "seo-monitor.yml").read_text(encoding="utf-8")
        self.assertIn("webmasters.readonly", wf)
        self.assertNotIn("openssl enc", wf)
        self.assertIn("SEO_REPORT_AGE_RECIPIENT", wf)
        # authenticated jobs are restricted to the default branch; key auth needs explicit opt-in
        self.assertEqual(wf.count("github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"), 2)
        self.assertIn("vars.GSC_ALLOW_SA_KEY == 'true'", wf)
        self.assertNotIn("upload-pages-artifact", wf)
        self.assertNotIn("contents: write", wf)

    def test_final_delivery_state_requires_successful_upload(self):
        import subprocess
        import textwrap

        wf = (ROOT / ".github" / "workflows" / "seo-monitor.yml").read_text(encoding="utf-8")
        start = wf.index('            if [ "$state" = "ok" ]; then')
        end = wf.index('\n          fi\n          [ -n "$state" ]', start)
        guard = textwrap.dedent(wf[start:end])
        cases = [
            ("ok", "0", "0", "", "skipped", "ok"),
            ("ok", "0", "0", "age1example", "success", "ok"),
            ("ok", "0", "0", "age1example", "failure", "delivery_error"),
            ("ok", "0", "0", "age1example", "skipped", "delivery_error"),
            ("ok", "0", "0", "age1example", "cancelled", "delivery_error"),
            ("ok", "0", "1", "", "skipped", "delivery_error"),
            ("ok", "1", "0", "age1example", "success", "failed"),
            ("partial", "1", "1", "age1example", "failure", "partial"),
            ("auth_error", "", "", "age1example", "failure", "auth_error"),
        ]
        for initial, monitor, delivery, recipient, upload, expected in cases:
            with self.subTest(initial=initial, monitor=monitor, delivery=delivery, upload=upload):
                env = dict(os.environ, state=initial, MONITOR_CODE=monitor,
                           DELIVERY_CODE=delivery, SEO_REPORT_AGE_RECIPIENT=recipient,
                           AGE_UPLOAD_OUTCOME=upload)
                result = subprocess.run(["bash", "-eu", "-c", guard + '\nprintf "%s" "$state"'],
                                        env=env, capture_output=True, text=True, check=True)
                self.assertEqual(result.stdout, expected)



if __name__ == "__main__":
    unittest.main(verbosity=2)
