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
    def __init__(self, fail_inspect: str | None = None):
        self.calls: list[tuple[str, dict]] = []
        self.fail_inspect = fail_inspect

    def __call__(self, url, body):
        self.calls.append((url, body))
        if url == gm.INSPECT_ENDPOINT:
            if body["inspectionUrl"] == self.fail_inspect:
                raise gm.ApiError(403, "PERMISSION_DENIED")
            ok = body["inspectionUrl"] == "https://kanto.rss7.net/"
            return {"inspectionResult": {"indexStatusResult": {
                "verdict": "PASS" if ok else "NEUTRAL",
                "coverageState": "送信して登録されました" if ok else "検出 - インデックス未登録",
                "googleCanonical": body["inspectionUrl"] if ok else None,
            }}}
        dims = body.get("dimensions", [])
        if not dims:
            return {"rows": [{"keys": [], "clicks": 5, "impressions": 100, "ctr": 0.05, "position": 12.0}]}
        if dims == ["page"]:
            return {"rows": [{"keys": ["https://kanto.rss7.net/spots/kugenuma/"], "clicks": 2, "impressions": 40, "position": 8.0}]}
        return {"rows": [
            {"keys": ["鵠沼 波情報"], "clicks": 3, "impressions": 30, "position": 6.0},
            {"keys": ["鵠沼波情報"], "clicks": 1, "impressions": 10, "position": 10.0},
            {"keys": ["鵠沼 波情報 ライブ"], "clicks": 0, "impressions": 5, "position": 20.0},
            {"keys": ["大洗 波予想"], "clicks": 1, "impressions": 8, "position": 9.0},
            {"keys": ["片貝 天気"], "clicks": 0, "impressions": 3, "position": 30.0},
        ]}


KEYWORDS = [
    {"keyword": "鵠沼 波情報", "url": "https://kanto.rss7.net/spots/kugenuma/", "spot": "鵠沼"},
    {"keyword": "大洗・大貫 波予想", "url": "https://kanto.rss7.net/spots/oarai-onuki/", "spot": "大洗・大貫"},
    {"keyword": "片貝 波情報", "url": "https://kanto.rss7.net/spots/katakai/", "spot": "片貝"},
]


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
        fake = FakeGsc(fail_inspect="https://kanto.rss7.net/privacy/")
        rep = gm.run_monitor(CFG, fake, date(2026, 11, 28), KEYWORDS)
        self.assertEqual(len(rep["inspections"]), 13)
        self.assertEqual(len(rep["not_indexed"]), 11)  # 13 - home(PASS) - privacy(error)
        self.assertTrue(all("search-console/inspect" in i["console_link"] for i in rep["not_indexed"]))
        self.assertEqual(len(rep["errors"]), 1)
        kw = rep["performance"][28]["current"]["keywords"]
        self.assertEqual(kw[0]["exact"]["impressions"], 40)  # 「鵠沼 波情報」+「鵠沼波情報」
        self.assertAlmostEqual(kw[0]["exact"]["position"], 7.0)
        self.assertEqual(kw[0]["related"]["impressions"], 45)
        self.assertEqual(kw[1]["exact"]["impressions"], 0)
        self.assertEqual(kw[1]["related"]["impressions"], 8)
        self.assertEqual(kw[2]["related"]["impressions"], 0)
        self.assertEqual(rep["performance"][7]["current"]["spots"]["https://kanto.rss7.net/spots/kugenuma/"]["clicks"], 2)
        # only read-only endpoints were called
        for url, _ in fake.calls:
            self.assertTrue(url.startswith("https://searchconsole.googleapis.com/"), url)
        md = gm.to_markdown(rep, CFG)
        for needle in ("登録済み（verdict=PASS）: **1 / 13**", "未登録ページ", "7日", "28日", "90日", "大洗・大貫 波予想", "取得エラー"):
            self.assertIn(needle, md)
        self.assertIn("完全一致", gm.keyword_csv(rep))

    def test_without_keywords(self):
        rep = gm.run_monitor(CFG, FakeGsc(), date(2026, 11, 28), None)
        self.assertIn("未集計", gm.to_markdown(rep, CFG))

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

    def test_main_stdout_has_no_private_data(self):
        import contextlib
        import io

        fake = FakeGsc()
        orig = gm.make_post_json
        gm.make_post_json = lambda token: fake
        os.environ["GSC_ACCESS_TOKEN"] = "dummy"
        buf = io.StringIO()
        try:
            with tempfile.TemporaryDirectory() as d, contextlib.redirect_stdout(buf):
                code = gm.main(["--config", str(ROOT / "config" / "seo-monitor.json"), "--out-dir", d])
                self.assertTrue((Path(d) / "gsc-report.md").is_file())
        finally:
            gm.make_post_json = orig
            del os.environ["GSC_ACCESS_TOKEN"]
        out = buf.getvalue()
        self.assertEqual(code, 0)
        for secret in ("鵠沼 波情報", "検出 - インデックス未登録", "impressions", "NEUTRAL", "spots/"):
            self.assertNotIn(secret, out)


class RepoSafetyTests(unittest.TestCase):
    def test_no_indexing_api_usage_anywhere(self):
        for p in list((ROOT / "scripts" / "seo").glob("*.py")) + [ROOT / ".github" / "workflows" / "seo-monitor.yml"]:
            text = p.read_text(encoding="utf-8")
            self.assertNotIn("urlNotifications", text, p)
            self.assertNotIn("auth/indexing", text, p)

    def test_workflow_uses_readonly_scope_and_encrypts(self):
        wf = (ROOT / ".github" / "workflows" / "seo-monitor.yml").read_text(encoding="utf-8")
        self.assertIn("webmasters.readonly", wf)
        self.assertIn("openssl enc -aes-256-cbc -pbkdf2", wf)
        self.assertNotIn("upload-pages-artifact", wf)
        self.assertNotIn("contents: write", wf)


if __name__ == "__main__":
    unittest.main(verbosity=2)
