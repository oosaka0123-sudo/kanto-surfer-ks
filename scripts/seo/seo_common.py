"""Shared helpers for the KS SEO monitor (Kanto / Kansai / Kyushu).

Standard library only, so the workflow needs no pip install and no paid service.
Site-specific values live in config/seo-monitor.json; nothing here is Kanto-only.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

USER_AGENT = "KS-SEO-Monitor/1.0 (+https://github.com/oosaka0123-sudo)"


@dataclass
class HttpResult:
    url: str
    status: int | None
    headers: dict[str, str] = field(default_factory=dict)
    body: str = ""
    error: str | None = None

    def header(self, name: str) -> str:
        return self.headers.get(name.lower(), "")


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):  # noqa: D401 - urllib hook
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def http_get(url: str, timeout: float = 20.0, retries: int = 2, backoff: float = 3.0) -> HttpResult:
    """GET without following redirects, so 301/302 are reported as-is."""
    last_error = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
        try:
            with _OPENER.open(req, timeout=timeout) as resp:
                return HttpResult(url, resp.status, _lower_headers(resp.headers), _decode(resp.read()))
        except urllib.error.HTTPError as exc:  # 3xx/4xx/5xx land here
            status = exc.code
            result = HttpResult(url, status, _lower_headers(exc.headers), _decode(exc.read() or b""))
            if status >= 500 and attempt < retries:
                last_error = f"HTTP {status}"
                time.sleep(backoff * (attempt + 1))
                continue
            return result
        except Exception as exc:  # network / TLS / timeout
            last_error = f"{type(exc).__name__}: {exc}"
            if attempt < retries:
                time.sleep(backoff * (attempt + 1))
    return HttpResult(url, None, error=last_error)


def _lower_headers(headers) -> dict[str, str]:
    if headers is None:
        return {}
    return {k.lower(): v for k, v in headers.items()}


def _decode(raw: bytes) -> str:
    return raw.decode("utf-8", errors="replace")


class _HeadParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.canonicals: list[str] = []
        self.robots: list[str] = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "link" and "canonical" in a.get("rel", "").lower().split():
            self.canonicals.append(a.get("href", "").strip())
        if tag == "meta" and a.get("name", "").lower() in ("robots", "googlebot"):
            self.robots.append(a.get("content", "").strip().lower())


def parse_head(html: str) -> tuple[list[str], list[str]]:
    p = _HeadParser()
    try:
        p.feed(html)
    except Exception:
        pass
    return p.canonicals, p.robots


def load_config(path: str | Path) -> dict:
    cfg = json.loads(Path(path).read_text(encoding="utf-8"))
    validate_config(cfg)
    return cfg


def validate_config(cfg: dict) -> None:
    required = ["site_id", "base_url", "gsc_property", "spot_pages", "other_indexable_pages"]
    missing = [k for k in required if not cfg.get(k)]
    if missing:
        raise ValueError(f"config missing: {', '.join(missing)}")
    base = urlsplit(cfg["base_url"])
    if base.scheme != "https" or not cfg["base_url"].endswith("/"):
        raise ValueError("base_url must be https and end with '/'")
    for url in indexable_urls(cfg) + list(cfg.get("noindex_pages", [])):
        if urlsplit(url).netloc != base.netloc:
            raise ValueError(f"URL outside base host: {url}")
    urls = indexable_urls(cfg)
    if len(urls) != len(set(urls)):
        raise ValueError("duplicate URL in config")


def indexable_urls(cfg: dict) -> list[str]:
    """Home first, then spot pages, then the remaining indexable pages (order preserved, unique)."""
    out: list[str] = []
    others = list(cfg.get("other_indexable_pages", []))
    if cfg["base_url"] in others:
        out.append(cfg["base_url"])
    out += [s["url"] for s in cfg["spot_pages"]]
    out += [u for u in others if u not in out]
    return out
